// Recoleccion de eventos de uso de boomart.pe (medicion propia y anonima).
//
// La pagina (src/track.js) manda aqui, con navigator.sendBeacon, lotes de
// eventos como texto plano JSON (text/plain evita el preflight de CORS). La
// funcion los valida con una lista cerrada de campos y los inserta en
// public.web_eventos con la service role. No guarda IP, ni nombres, ni
// correos: solo los codigos aleatorios vid/sid que genera el navegador.
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
  };

  const filas = [];
  for (const e of eventos) {
    if (!e || typeof e !== "object") continue;
    const ev = e as Record<string, unknown>;
    const tipo = texto(ev.t, 30);
    if (!tipo || !TIPOS.has(tipo)) continue;
    let extra: Record<string, string> | null = null;
    if (ev.d && typeof ev.d === "object") {
      extra = {};
      for (const [k, v] of Object.entries(ev.d as Record<string, unknown>).slice(0, 6)) {
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
