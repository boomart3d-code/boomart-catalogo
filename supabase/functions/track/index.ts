// Recoleccion de eventos de uso de boomart.pe (medicion propia y anonima).
//
// La pagina (src/track.js) manda aqui, con navigator.sendBeacon, lotes de
// eventos como texto plano JSON (text/plain evita el preflight de CORS). La
// funcion los valida con una lista cerrada de campos y los inserta en
// public.web_eventos con la service role. No guarda IP, ni nombres, ni
// correos: solo los codigos aleatorios vid/sid que genera el navegador, mas la
// ubicacion aproximada (pais y, en Peru, region y ciudad). Esa ubicacion se
// busca con la IP en las tablas geo_ip_* (DB-IP Lite, CC BY 4.0, db-ip.com);
// la IP solo se usa en memoria para la busqueda y NO se guarda ni se registra.
//
// DESPLIEGUE: verificacion de JWT DESACTIVADA (la llama cualquier visitante).
// Se protege con: origen permitido, lista cerrada de eventos, limites de
// tamano y de eventos por sesion, y descarte de robots obvios.
//
// Secret: SB_SERVICE_ROLE_KEY (el mismo que usa la funcion `seguimiento`).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
  Deno.env.get("SB_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ORIGENES = new Set(["https://boomart.pe", "https://www.boomart.pe"]);
const HOSTS = new Set(["boomart.pe", "www.boomart.pe"]);
const TIPOS = new Set([
  "visita", "ver_producto", "filtrar", "buscar", "agregar_carrito",
  "abrir_carrito", "iniciar_compra", "pedido_whatsapp", "clic_whatsapp",
  "compartir", "tiempo",
]);
const BOT_RE =
  /bot|crawl|spider|slurp|headless|lighthouse|facebookexternalhit|meta-externalagent|preview|python|curl|wget|httpclient|axios|node-fetch|go-http/i;
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_BODY = 8000;
const MAX_EVENTOS_POR_LOTE = 25;
const MAX_EVENTOS_POR_SESION = 400;

const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": ORIGENES.has(origin) ? origin : "https://boomart.pe",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Vary": "Origin",
});

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
};
const entero = (v: unknown, min: number, max: number): number | null => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
};
const decimal = (v: unknown, min: number, max: number): number | null => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
};

// IP -> claves numericas para buscar en geo_ip_*: IPv4 como entero de 32 bits; IPv6 con
// sus primeros 48 bits (paises) y 64 bits (Peru). Devuelve null si no se entiende la IP.
const claveIp = (txt: string): { fam: number; k48: number; k64: string } | null => {
  let ip = (txt ?? "").trim();
  if (!ip) return null;
  const m4 = ip.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i);
  if (m4) {
    const o = m4.slice(1).map(Number);
    if (o.some((n) => n > 255)) return null;
    const n = ((o[0] * 256 + o[1]) * 256 + o[2]) * 256 + o[3];
    return { fam: 4, k48: n, k64: String(n) };
  }
  if (!ip.includes(":")) return null;
  ip = ip.replace(/%.*$/, "");
  const dobles = ip.split("::");
  if (dobles.length > 2) return null;
  const izq = dobles[0] ? dobles[0].split(":") : [];
  const der = dobles.length === 2 && dobles[1] ? dobles[1].split(":") : [];
  let partes: string[];
  if (dobles.length === 2) {
    const faltan = 8 - izq.length - der.length;
    if (faltan < 1) return null;
    partes = [...izq, ...Array(faltan).fill("0"), ...der];
  } else {
    partes = izq;
  }
  if (partes.length !== 8 || partes.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  const g = partes.map((x) => parseInt(x, 16));
  const k48 = (BigInt(g[0]) << 32n) | (BigInt(g[1]) << 16n) | BigInt(g[2]);
  const k64 = (k48 << 16n) | BigInt(g[3]);
  return { fam: 6, k48: Number(k48), k64: k64.toString() };
};

// Pais / region / ciudad de la visita. Si algo falla, la visita se guarda igual sin ubicacion.
const ubicacion = async (req: Request) => {
  const vacio = { pais: null as string | null, region: null as string | null, ciudad: null as string | null };
  try {
    const ip = req.headers.get("cf-connecting-ip") ?? (req.headers.get("x-forwarded-for") ?? "").split(",")[0];
    const k = claveIp(ip);
    if (!k) return vacio;
    const { data, error } = await sb.rpc("geo_ip", { p_fam: k.fam, p_k48: k.k48, p_k64: k.k64 });
    if (error || !data || typeof data !== "object") return vacio;
    const d = data as Record<string, unknown>;
    const pais = texto(d.pais, 2);
    return {
      pais: pais && /^[A-Za-z]{2}$/.test(pais) ? pais.toUpperCase() : null,
      region: texto(d.region, 60),
      ciudad: texto(d.ciudad, 60),
    };
  } catch {
    return vacio;
  }
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const headers = cors(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response("Metodo no permitido", { status: 405, headers });
  if (!ORIGENES.has(origin)) return new Response("Origen no permitido", { status: 403, headers });

  // Robots obvios: se ignoran sin guardar nada (responder 204 para no dar pistas).
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT_RE.test(ua)) return new Response(null, { status: 204, headers });

  let cuerpo: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return new Response("Demasiado grande", { status: 413, headers });
    cuerpo = JSON.parse(raw);
  } catch {
    return new Response("JSON invalido", { status: 400, headers });
  }

  const vid = texto(cuerpo.vid, 64);
  const sid = texto(cuerpo.sid, 64);
  if (!vid || !sid || !ID_RE.test(vid) || !ID_RE.test(sid)) {
    return new Response("Identificadores invalidos", { status: 400, headers });
  }
  const host = texto(cuerpo.host, 80);
  if (!host || !HOSTS.has(host)) return new Response(null, { status: 204, headers });

  const eventos = Array.isArray(cuerpo.evs) ? cuerpo.evs.slice(0, MAX_EVENTOS_POR_LOTE) : [];
  if (!eventos.length) return new Response(null, { status: 204, headers });

  // Tope de eventos por sesion (frena a quien intente inflar los numeros).
  const { count } = await sb
    .from("web_eventos")
    .select("id", { count: "exact", head: true })
    .eq("sid", sid);
  if ((count ?? 0) >= MAX_EVENTOS_POR_SESION) return new Response(null, { status: 204, headers });

  // Ubicacion aproximada por IP (la IP no se guarda).
  const geo = await ubicacion(req);

  // Campos de sesion (iguales para todo el lote).
  const base = {
    vid,
    sid,
    host,
    pagina: texto(cuerpo.pag, 160),
    landing: texto(cuerpo.land, 160),
    fuente: texto(cuerpo.fu, 60),
    medio: texto(cuerpo.me, 60),
    campana: texto(cuerpo.ca, 120),
    ref: texto(cuerpo.ref, 80),
    dispositivo: ["movil", "pc", "tablet"].includes(String(cuerpo.dev)) ? String(cuerpo.dev) : null,
    tz: texto(cuerpo.tz, 60),
    idioma: texto(cuerpo.lang, 20),
    humano: cuerpo.hum === true,
    nuevo: cuerpo.nuevo === true,
    ...geo,
  };

  const filas = [];
  for (const e of eventos) {
    if (!e || typeof e !== "object") continue;
    const ev = e as Record<string, unknown>;
    const tipo = texto(ev.t, 30);
    if (!tipo || !TIPOS.has(tipo)) continue;
    let extra: Record<string, unknown> | null = null;
    if (ev.d && typeof ev.d === "object") {
      extra = {};
      for (const [k, v] of Object.entries(ev.d as Record<string, unknown>).slice(0, 6)) {
        if (k === "items" && tipo === "pedido_whatsapp" && Array.isArray(v)) {
          extra.items = v.slice(0, 20).flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const id = texto(item.id, 80);
            const cantidad = entero(item.cantidad, 1, 999);
            return id && cantidad ? [{ id, cantidad, variante: texto(item.variante, 60) }] : [];
          });
          continue;
        }
        const val = texto(String(v ?? ""), 60);
        if (val) extra[String(k).slice(0, 20)] = val;
      }
      if (!Object.keys(extra).length) extra = null;
    }
    filas.push({
      ...base,
      pv: texto(ev.pv, 24),
      tipo,
      producto: texto(ev.p, 80),
      boton: texto(ev.b, 30),
      origen: texto(ev.o, 30),
      valor: decimal(ev.v, 0, 100000),
      cantidad: entero(ev.c, 0, 999),
      seg: entero(ev.s, 0, 86400),
      scroll: entero(ev.sc, 0, 100),
      extra,
    });
  }
  if (!filas.length) return new Response(null, { status: 204, headers });

  const { error } = await sb.from("web_eventos").insert(filas);
  if (error) {
    console.error("track insert error", error.message);
    return new Response("No se pudo guardar", { status: 500, headers });
  }
  return new Response(null, { status: 204, headers });
});
