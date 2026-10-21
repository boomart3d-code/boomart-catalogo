// Libro de Reclamaciones virtual de boomart.pe (pedido de Adrian, 2026-10-21).
//
// La pagina libro-de-reclamaciones.html manda aqui la hoja de reclamacion (JSON). La funcion:
//   1) valida y limita todos los campos,
//   2) la guarda en public.reclamos (service role) y le asigna el numero correlativo LR-AAAA-NNNNN,
//   3) envia por correo la constancia al consumidor (con copia oculta a boomart.3d@gmail.com).
// Si el correo falla, el reclamo igual queda guardado (correo_enviado=false) y se responde ok.
//
// DESPLIEGUE: verificacion de JWT DESACTIVADA (la llama cualquier visitante). Se protege con:
// origen permitido, campo trampa (honeypot), limites de tamano, y un maximo de hojas por IP
// y por correo. La IP solo se guarda como huella (hash), nunca en claro.
//
// Secrets: RESEND_API_KEY y SB_SERVICE_ROLE_KEY (los mismos que usan las otras funciones).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
  Deno.env.get("SB_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ORIGENES = new Set(["https://boomart.pe", "https://www.boomart.pe"]);
const BCC = "boomart.3d@gmail.com";
const MAX_BODY = 12000;
const MAX_POR_IP_HORA = 5;
const MAX_POR_CORREO_DIA = 5;

const PROVEEDOR = {
  razon: "MOLINA ESCALONA MONICA CARINA (nombre comercial: BoomArt)",
  ruc: "15610001596",
  direccion: "Jr. Eduardo García Calderón 127, Bellavista, Callao",
};

const cors = (origin: string | null): Record<string, string> => ({
  "Access-Control-Allow-Origin": origin && ORIGENES.has(origin) ? origin : "https://boomart.pe",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Vary": "Origin",
});

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]);

const txt = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const txtLargo = (v: unknown, max: number) => String(v ?? "").replace(/\r/g, "").trim().slice(0, max);

async function huella(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${ip}|boomart-reclamos`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405, origin);
  if (!origin || !ORIGENES.has(origin)) return json({ error: "Origen no permitido" }, 403, origin);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: "Texto demasiado largo" }, 413, origin);
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(raw);
  } catch (_e) {
    return json({ error: "Datos inválidos" }, 400, origin);
  }

  // campo trampa: un robot lo rellena, una persona no lo ve
  if (txt(b.web, 100) !== "") return json({ ok: true, numero: "LR-0000-00000" }, 200, origin);

  const tipo = txt(b.tipo, 10);
  const docTipo = txt(b.docTipo, 12).toUpperCase();
  const bienTipo = txt(b.bienTipo, 10);
  const email = txt(b.email, 120).toLowerCase();
  const reg = {
    tipo,
    nombre: txt(b.nombre, 120),
    doc_tipo: docTipo,
    doc_numero: txt(b.docNumero, 20),
    domicilio: txt(b.domicilio, 200),
    telefono: txt(b.telefono, 25),
    email,
    menor_edad: b.menorEdad === true,
    apoderado: txt(b.apoderado, 140) || null,
    bien_tipo: bienTipo,
    bien_detalle: txt(b.bienDetalle, 200),
    pedido_ref: txt(b.pedidoRef, 60) || null,
    monto: b.monto === "" || b.monto == null ? null : Number(b.monto),
    detalle: txtLargo(b.detalle, 2500),
    pedido_consumidor: txtLargo(b.pedidoConsumidor, 1500),
    acepta_datos: b.aceptaDatos === true,
  };

  const errores: string[] = [];
  if (!["reclamo", "queja"].includes(reg.tipo)) errores.push("tipo");
  if (reg.nombre.length < 3) errores.push("nombre");
  if (!["DNI", "CE", "PASAPORTE", "RUC"].includes(reg.doc_tipo)) errores.push("docTipo");
  if (!/^[A-Za-z0-9-]{6,20}$/.test(reg.doc_numero)) errores.push("docNumero");
  if (reg.domicilio.length < 5) errores.push("domicilio");
  if (!/^[0-9+() -]{6,25}$/.test(reg.telefono)) errores.push("telefono");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(reg.email)) errores.push("email");
  if (reg.menor_edad && !reg.apoderado) errores.push("apoderado");
  if (!["producto", "servicio"].includes(reg.bien_tipo)) errores.push("bienTipo");
  if (reg.bien_detalle.length < 3) errores.push("bienDetalle");
  if (reg.monto !== null && (!Number.isFinite(reg.monto) || reg.monto < 0 || reg.monto > 1000000)) errores.push("monto");
  if (reg.detalle.length < 10) errores.push("detalle");
  if (reg.pedido_consumidor.length < 5) errores.push("pedidoConsumidor");
  if (!reg.acepta_datos) errores.push("aceptaDatos");
  if (errores.length) return json({ error: "Revisa los campos marcados", campos: errores }, 422, origin);

  // limites contra abuso
  const ip = req.headers.get("cf-connecting-ip") ?? (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ipHash = ip ? await huella(ip) : null;
  const hace1h = new Date(Date.now() - 3600_000).toISOString();
  const hace24h = new Date(Date.now() - 86400_000).toISOString();
  if (ipHash) {
    const { count } = await sb.from("reclamos").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("creado", hace1h);
    if ((count ?? 0) >= MAX_POR_IP_HORA) return json({ error: "Demasiados envíos. Intenta más tarde o escríbenos a contacto@boomart.pe." }, 429, origin);
  }
  {
    const { count } = await sb.from("reclamos").select("id", { count: "exact", head: true }).eq("email", reg.email).gte("creado", hace24h);
    if ((count ?? 0) >= MAX_POR_CORREO_DIA) return json({ error: "Ya recibimos varios envíos con este correo. Escríbenos a contacto@boomart.pe." }, 429, origin);
  }

  const { data: fila, error } = await sb.from("reclamos").insert({ ...reg, ip_hash: ipHash }).select("id, creado").single();
  if (error || !fila) {
    console.error("reclamos insert error", error?.message);
    return json({ error: "No pudimos registrar tu hoja. Escríbenos a contacto@boomart.pe." }, 500, origin);
  }
  const anio = new Date(fila.creado).toLocaleString("en-CA", { timeZone: "America/Lima", year: "numeric" });
  const numero = `LR-${anio}-${String(fila.id).padStart(5, "0")}`;
  await sb.from("reclamos").update({ numero }).eq("id", fila.id);

  // constancia por correo al consumidor (copia oculta a BoomArt)
  const fecha = new Date(fila.creado).toLocaleString("es-PE", { timeZone: "America/Lima" });
  const filas: [string, string][] = [
    ["N.º de hoja", numero],
    ["Fecha y hora de recepción", fecha],
    ["Tipo", reg.tipo === "reclamo" ? "Reclamo" : "Queja"],
    ["Proveedor", `${PROVEEDOR.razon} · RUC ${PROVEEDOR.ruc}`],
    ["Domicilio del proveedor", PROVEEDOR.direccion],
    ["Consumidor", `${reg.nombre} · ${reg.doc_tipo} ${reg.doc_numero}`],
    ["Domicilio", reg.domicilio],
    ["Teléfono / Correo", `${reg.telefono} · ${reg.email}`],
    ...(reg.menor_edad ? [["Padre, madre o apoderado", reg.apoderado ?? ""] as [string, string]] : []),
    ["Bien contratado", `${reg.bien_tipo === "producto" ? "Producto" : "Servicio"}: ${reg.bien_detalle}`],
    ["Pedido (si aplica)", reg.pedido_ref ?? "—"],
    ["Monto reclamado", reg.monto === null ? "—" : `S/ ${reg.monto.toFixed(2)}`],
    ["Detalle", reg.detalle],
    ["Pedido del consumidor", reg.pedido_consumidor],
  ];
  const tabla = filas.map(([k, v]) =>
    `<tr><td style="padding:7px 12px;color:#777;font-size:13px;vertical-align:top;white-space:nowrap;">${esc(k)}</td><td style="padding:7px 12px;color:#222;font-size:14px;white-space:pre-wrap;">${esc(v)}</td></tr>`).join("");
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:#e1132f;padding:18px 22px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;color:#fff;font-size:19px;">Constancia de tu ${reg.tipo === "reclamo" ? "reclamo" : "queja"} · ${esc(numero)}</h1>
      </div>
      <div style="padding:18px 22px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px;">
        <p style="font-size:14px;color:#333;margin-top:0;">Hola ${esc(reg.nombre)}, recibimos tu hoja del Libro de Reclamaciones de boomart.pe. Esta es tu copia. Te responderemos por correo dentro del plazo que establece la normativa de protección al consumidor.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:6px;">${tabla}</table>
        <p style="font-size:12px;color:#777;margin-bottom:0;">La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.</p>
      </div>
    </div>`;
  let enviado = false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "BoomArt <contacto@boomart.pe>",
        to: reg.email,
        bcc: BCC,
        reply_to: "contacto@boomart.pe",
        subject: `Constancia de ${reg.tipo === "reclamo" ? "reclamo" : "queja"} ${numero} · BoomArt`,
        html,
      }),
    });
    enviado = r.ok;
    if (!r.ok) console.error("reclamos correo error", r.status, await r.text());
  } catch (e) {
    console.error("reclamos correo excepcion", String(e));
  }
  if (enviado) await sb.from("reclamos").update({ correo_enviado: true }).eq("id", fila.id);

  return json({ ok: true, numero, correo: enviado }, 200, origin);
});
