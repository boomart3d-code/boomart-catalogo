// Amigo Secreto por correo (pedido de Adrián, 2026-11-26). Página: boomart.pe/amigo-secreto/
//
// Acciones (POST JSON { accion, ... }):
//  * "crear"     -> valida, sortea en el servidor y guarda. Envía SOLO un correo al organizador para
//                   que confirme que el correo es suyo (así nadie usa la página para enviar spam).
//  * "confirmar" -> con el token del correo del organizador: envía a cada participante su amigo
//                   secreto (con ideas de regalo del catálogo según el presupuesto y el botón de
//                   ofertas) y al organizador un resumen (con las parejas solo en modo "admin").
//  * "ofertas"   -> el participante tocó "Sí, quiero recibir ofertas": se guarda en
//                   contactos_marketing con el texto aceptado (Ley 29733) y se le envía la baja.
//  * "baja"      -> deja de recibir ofertas.
//
// Decisiones de Adrián (2026-11-26): base de correos solo con permiso de cada persona; descuento
// con el código AMIGO10 (10 %) mencionado por WhatsApp (no toca el carrito); estos correos NO llevan
// copia oculta a boomart.3d@gmail.com, para no revelar las parejas.
//
// Desplegar con: supabase functions deploy amigo-secreto --no-verify-jwt
// Secrets: RESEND_API_KEY, SB_SERVICE_ROLE_KEY (los mismos de registro-web-correos).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  SITE, validar, sortear, ideasDeRegalo, correoConfirmacion, correoParticipante, correoResumen,
  correoSuscripcion, TEXTO_CONSENTIMIENTO, type Correo, type Sorteo, type Producto,
} from "./logic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = "BoomArt <contacto@boomart.pe>";
const ORIGENES = new Set(["https://boomart.pe", "https://www.boomart.pe"]);
const LIMITE_DIA = 5; // sorteos por día por conexión y por correo de organizador
const PAGINA = SITE + "/amigo-secreto/";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGENES.has(origin) ? origin : "https://boomart.pe",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}

async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function tokenAleatorio(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function enteroAleatorio(n: number): number { return crypto.getRandomValues(new Uint32Array(1))[0] % n; }

async function enviar(c: Correo): Promise<boolean> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: c.to, reply_to: "contacto@boomart.pe", subject: c.subject, html: c.html, text: c.text }),
  });
  return r.ok;
}
// Envío por lotes (hasta 100 por llamada). Si el lote falla, intenta uno por uno.
async function enviarLote(correos: Correo[]): Promise<boolean[]> {
  const r = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(correos.map((c) => ({ from: FROM, to: c.to, reply_to: "contacto@boomart.pe", subject: c.subject, html: c.html, text: c.text }))),
  });
  if (r.ok) return correos.map(() => true);
  const res: boolean[] = [];
  for (const c of correos) { res.push(await enviar(c).catch(() => false)); await new Promise((ok) => setTimeout(ok, 550)); }
  return res;
}

async function catalogo(): Promise<Producto[]> {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(SITE + "/catalogo.json", { signal: ctrl.signal }); clearTimeout(t);
    const j = await r.json();
    return Array.isArray(j.products) ? j.products : [];
  } catch { return []; }
}

const sumarDias = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const H = cors(origin);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...H, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido." }, 405);
  if (origin && !ORIGENES.has(origin)) return json({ ok: false, error: "Origen no permitido." }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Datos inválidos." }, 400); }
  const ahora = new Date();

  try {
    // ---------------------------------------------------------------- crear
    if (body.accion === "crear") {
      const v = validar(body);
      if (!v.ok) return json({ ok: false, error: v.error }, 400);
      const s = v.sorteo;

      // Limpieza: los sorteos se borran solos después del intercambio.
      await sb.from("amigo_secreto_sorteos").delete().lt("borrar_en", ahora.toISOString());

      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
      const huella = await sha256(`${ip}|boomart-amigo-secreto`);
      const desde = sumarDias(ahora, -1).toISOString();
      const [porIp, porCorreo] = await Promise.all([
        sb.from("amigo_secreto_sorteos").select("id", { count: "exact", head: true }).eq("ip_huella", huella).gte("creado_en", desde),
        sb.from("amigo_secreto_sorteos").select("id", { count: "exact", head: true }).eq("organizador_email", s.organizador.email).gte("creado_en", desde),
      ]);
      if ((porIp.count ?? 0) >= LIMITE_DIA || (porCorreo.count ?? 0) >= LIMITE_DIA) {
        return json({ ok: false, error: "Hiciste muchos sorteos hoy. Inténtalo de nuevo mañana." }, 429);
      }

      const to = sortear(s.participantes.length, s.excepciones, enteroAleatorio);
      if (!to) return json({ ok: false, error: "Con esas excepciones no hay forma de sortear. Quita alguna o agrega participantes." }, 400);

      const token = tokenAleatorio();
      const fechaBase = s.fecha ? new Date(s.fecha + "T12:00:00Z") : sumarDias(ahora, 60);
      const borrar = new Date(Math.min(sumarDias(fechaBase, 30).getTime(), sumarDias(ahora, 400).getTime()));
      const { data: sorteo, error } = await sb.from("amigo_secreto_sorteos").insert({
        evento: s.evento, tipo: s.tipo, fecha: s.fecha, presupuesto: s.presupuesto, nota: s.nota, modo: s.modo,
        organizador_nombre: s.organizador.nombre, organizador_email: s.organizador.email,
        confirmar_hash: await sha256(token), confirmar_vence: sumarDias(ahora, 2).toISOString(),
        ip_huella: huella, borrar_en: borrar.toISOString(),
      }).select("id").single();
      if (error || !sorteo) throw error || new Error("sin sorteo");

      const filas = s.participantes.map((p, i) => ({
        sorteo_id: sorteo.id, orden: i, nombre: p.nombre, email: p.email, regala_a: to[i],
        ofertas_hash: "pendiente-" + tokenAleatorio(), // se reemplaza al enviar el correo
      }));
      const ins = await sb.from("amigo_secreto_participantes").insert(filas);
      if (ins.error) { await sb.from("amigo_secreto_sorteos").delete().eq("id", sorteo.id); throw ins.error; }

      const ok = await enviar(correoConfirmacion(s, `${PAGINA}?confirmar=${token}`)).catch(() => false);
      if (!ok) {
        await sb.from("amigo_secreto_sorteos").delete().eq("id", sorteo.id);
        return json({ ok: false, error: "No pudimos enviar el correo de confirmación. Revisa tu correo e inténtalo de nuevo." }, 502);
      }
      return json({ ok: true, participantes: s.participantes.length });
    }

    // ---------------------------------------------------------------- confirmar
    if (body.accion === "confirmar") {
      const hash = await sha256(String(body.token || ""));
      const { data: so } = await sb.from("amigo_secreto_sorteos").select("*").eq("confirmar_hash", hash).maybeSingle();
      if (!so) return json({ ok: false, error: "Este enlace no es válido o el sorteo ya se borró." }, 404);

      const cargar = async () => (await sb.from("amigo_secreto_participantes").select("*").eq("sorteo_id", so.id).order("orden")).data || [];
      const paresDe = (ps: any[]) => so.modo === "admin" ? ps.map((p) => ({ de: p.nombre, para: ps[p.regala_a]?.nombre })) : undefined;

      if (so.estado === "enviado" || so.estado === "enviando") {
        const ps = await cargar();
        return json({ ok: true, ya: true, modo: so.modo, total: ps.length, enviados: ps.filter((p) => p.enviado_en).length, pares: paresDe(ps) });
      }
      if (new Date(so.confirmar_vence) < ahora) return json({ ok: false, error: "El enlace venció (48 horas). Vuelve a hacer el sorteo." }, 410);

      // Reclama el envío para que dos clics no envíen dos veces.
      const claim = await sb.from("amigo_secreto_sorteos").update({ estado: "enviando", confirmado_en: ahora.toISOString() })
        .eq("id", so.id).eq("estado", "pendiente").select("id");
      if (!claim.data?.length) return json({ ok: false, error: "Este sorteo ya se está enviando." }, 409);

      const ps = await cargar();
      const s: Sorteo = {
        evento: so.evento, tipo: so.tipo, fecha: so.fecha, presupuesto: so.presupuesto, nota: so.nota, modo: so.modo,
        organizador: { nombre: so.organizador_nombre, email: so.organizador_email },
        participantes: ps.map((p: any) => ({ nombre: p.nombre, email: p.email })), excepciones: [],
      };
      const to = ps.map((p: any) => p.regala_a);
      const ideas = ideasDeRegalo(await catalogo(), s.presupuesto);

      const correos: Correo[] = [];
      for (let i = 0; i < ps.length; i++) {
        const t = tokenAleatorio();
        await sb.from("amigo_secreto_participantes").update({ ofertas_hash: await sha256(t) }).eq("id", ps[i].id);
        correos.push(correoParticipante(s, i, s.participantes[to[i]].nombre, ideas, `${PAGINA}?ofertas=${t}`));
      }
      const resultado = await enviarLote(correos);
      const fallidos: number[] = [];
      for (let i = 0; i < ps.length; i++) {
        if (resultado[i]) await sb.from("amigo_secreto_participantes").update({ enviado_en: new Date().toISOString(), envio_error: "" }).eq("id", ps[i].id);
        else { fallidos.push(i); await sb.from("amigo_secreto_participantes").update({ envio_error: "no enviado" }).eq("id", ps[i].id); }
      }
      await sb.from("amigo_secreto_sorteos").update({ estado: fallidos.length === ps.length ? "error" : "enviado", enviado_en: new Date().toISOString() }).eq("id", so.id);
      await enviar(correoResumen(s, to, fallidos)).catch(() => false);
      return json({ ok: true, modo: so.modo, total: ps.length, enviados: ps.length - fallidos.length, pares: paresDe(ps) });
    }

    // ---------------------------------------------------------------- ofertas (consentimiento)
    if (body.accion === "ofertas") {
      const hash = await sha256(String(body.token || ""));
      const { data: p } = await sb.from("amigo_secreto_participantes").select("nombre,email").eq("ofertas_hash", hash).maybeSingle();
      if (!p) return json({ ok: false, error: "Este enlace ya no es válido: los datos del sorteo se borran después del intercambio." }, 404);
      const baja = tokenAleatorio();
      const fila = {
        email: p.email, nombre: p.nombre, fuente: "amigo_secreto", consentimiento_en: ahora.toISOString(),
        consentimiento_texto: TEXTO_CONSENTIMIENTO, baja_hash: await sha256(baja), baja_en: null,
      };
      const up = await sb.from("contactos_marketing").upsert(fila, { onConflict: "email" });
      if (up.error) throw up.error;
      await enviar(correoSuscripcion(p.nombre, p.email, `${PAGINA}?baja=${baja}`)).catch(() => false);
      return json({ ok: true, nombre: String(p.nombre).split(" ")[0] });
    }

    // ---------------------------------------------------------------- baja
    if (body.accion === "baja") {
      const hash = await sha256(String(body.token || ""));
      const { data } = await sb.from("contactos_marketing").update({ baja_en: ahora.toISOString() }).eq("baja_hash", hash).select("id");
      if (!data?.length) return json({ ok: false, error: "Este enlace no es válido." }, 404);
      return json({ ok: true });
    }

    return json({ ok: false, error: "Acción desconocida." }, 400);
  } catch (e) {
    console.error("amigo-secreto", e);
    return json({ ok: false, error: "Tuvimos un problema. Inténtalo de nuevo en unos minutos." }, 500);
  }
});
