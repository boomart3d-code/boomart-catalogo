// Remarketing del registro web (pedido de Adrián, 2026-10-15).
//
// Clientes registrados en boomart.pe (tabla clientes_web) que todavía NO
// enviaron un pedido desde la web reciben hasta 3 correos, contados desde su
// registro: a las 2 horas, a las 24 horas y a las 48 horas. Cada uno se envía
// una sola vez (clientes_web_correos) y solo dentro de su franja — si un tramo
// se pasó (p. ej. la función estuvo caída), no se manda tarde ni de golpe.
// Sin descuento extra: solo recuerda su cupón de bienvenida del 10 % si aún lo
// tiene disponible. Reemplaza al recordatorio único de 24 h de las cuentas con
// inicio de sesión (que ya no existen en la web).
//
// También reintenta los correos de bienvenida/aviso que hayan quedado
// pendientes (llama a registro-web-correos).
//
// El cron existente (`send-cart-reminders`, cada 15 minutos) la invoca; se
// conserva el nombre para no tocar el cron. Acepta {"dry_run": true}.
// Secrets: SB_SERVICE_ROLE_KEY, RESEND_API_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SITE = "https://boomart.pe";
const CATALOG_URL = `${SITE}/data/products.json`;
const ADMIN_BCC = "boomart.3d@gmail.com";
const EPOCH = "1970-01-01T00:00:00+00:00";
const HOUR = 3600000;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Franjas: [tipo, desde (h), hasta (h)].
const TIERS: [string, number, number][] = [
  ["remarketing_2h", 2, 24],
  ["remarketing_24h", 24, 48],
  ["remarketing_48h", 48, 72],
];

const COPY: Record<string, { subject: string; title: string; intro: string; button: string }> = {
  remarketing_2h: {
    subject: "¿Te ayudamos a completar tu pedido en BoomArt?",
    title: "Tu pieza te está esperando",
    intro: "Vimos que te registraste en BoomArt. Si te quedó alguna duda sobre medidas, materiales o entrega, escríbenos y te ayudamos a elegir.",
    button: "Continuar mi compra",
  },
  remarketing_24h: {
    subject: "Tu 10 % de bienvenida sigue disponible en BoomArt",
    title: "¿Lo pensaste mejor?",
    intro: "Cada pieza se fabrica a pedido en Lima y Callao, con envíos a todo el Perú. Tu registro ya está listo: solo te falta finalizar tu compra.",
    button: "Ver mi carrito",
  },
  remarketing_48h: {
    subject: "Último recordatorio de BoomArt",
    title: "Te guardamos tu lugar",
    intro: "Este es nuestro último recordatorio. Si quieres tu pieza, finaliza tu pedido en boomart.pe o escríbenos por WhatsApp y lo coordinamos contigo.",
    button: "Finalizar mi pedido",
  },
};

function esc(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c],
  );
}

async function loadCatalog(): Promise<Map<string, any>> {
  const catalog = new Map<string, any>();
  try {
    const response = await fetch(CATALOG_URL);
    if (response.ok) {
      const products = await response.json();
      if (Array.isArray(products)) for (const p of products) catalog.set(p.id, p);
    }
  } catch (_err) {
    // sin catálogo se envía igual, con la imagen institucional
  }
  return catalog;
}

function productFor(items: any[], catalog: Map<string, any>) {
  for (const item of Array.isArray(items) ? items : []) {
    const p = catalog.get(String(item?.productId || ""));
    if (p) return p;
  }
  return null;
}

function buildHtml(tipo: string, c: any, product: any) {
  const copy = COPY[tipo];
  const name = esc(String(c.full_name || "").trim().split(/\s+/)[0] || "");
  // Miniatura liviana (assets/og/<id>.jpg, < 250 KB) en vez de la foto grande.
  const image = product ? `${SITE}/assets/og/${encodeURIComponent(product.id)}.jpg` : `${SITE}/assets/boomart-og.jpg`;
  const link = product ? `${SITE}/producto/${encodeURIComponent(product.id)}/?src=remarketing` : `${SITE}/?src=remarketing`;
  const productLine = product
    ? `<p style="margin:0 0 16px;color:#514c46;font-size:15px;line-height:1.55;">La pieza que estabas viendo, <strong>${esc(product.name)}</strong>, sigue disponible.</p>`
    : "";
  const coupon = c.cupon_usado_en
    ? ""
    : `<p style="margin:0 0 18px;padding:12px 14px;background:#f4f0e8;border-left:4px solid #e1132f;color:#2e2b28;font-size:14px;line-height:1.5;">Recuerda: tienes <strong>10 % de descuento</strong> en tu primera compra pagando con Yape, Plin o transferencia, finalizando en boomart.pe.</p>`;
  return `
  <div style="background:#f4f0e8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d8d2c9;">
      <div style="background:#0b0b0b;padding:18px 24px;border-bottom:4px solid #e1132f;">
        <img src="${SITE}/assets/boomart-logo-1.png" width="140" alt="BoomArt" style="display:block;max-width:140px;height:auto;">
      </div>
      <img src="${esc(image)}" width="560" alt="${esc(product?.name || "Piezas de BoomArt")}" style="display:block;width:100%;height:auto;">
      <div style="padding:26px 26px 22px;">
        <h1 style="margin:0 0 14px;color:#0b0b0b;font-size:22px;line-height:1.3;">${copy.title}</h1>
        <p style="margin:0 0 14px;color:#2e2b28;font-size:16px;line-height:1.55;">Hola${name ? ` ${name}` : ""}, ${copy.intro}</p>
        ${productLine}
        ${coupon}
        <div style="text-align:center;margin:6px 0 4px;">
          <a href="${esc(link)}" style="background:#e1132f;color:#ffffff;padding:14px 26px;text-decoration:none;display:inline-block;font-size:16px;font-weight:700;">${copy.button}</a>
        </div>
        <p style="margin:22px 0 0;color:#6f6961;font-size:12px;line-height:1.5;text-align:center;">Recibes este correo porque te registraste en boomart.pe. Si no deseas más recordatorios, respóndenos este correo.</p>
      </div>
    </div>
  </div>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "BoomArt <contacto@boomart.pe>", to, bcc: ADMIN_BCC, reply_to: "contacto@boomart.pe", subject, html }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);
}

Deno.serve(async (request) => {
  let dryRun = false;
  try {
    const body = await request.json();
    dryRun = body?.dry_run === true;
  } catch (_err) {
    // el cron puede no enviar cuerpo
  }

  // 1) Reintentar bienvenidas/avisos pendientes (más de 2 minutos sin salir).
  let reintentos = 0;
  if (!dryRun) {
    const { count } = await sb
      .from("clientes_web_correos")
      .select("id", { count: "exact", head: true })
      .eq("enviado_en", EPOCH);
    if (count) {
      reintentos = count;
      await fetch(`${SUPABASE_URL}/functions/v1/registro-web-correos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }).catch(() => {});
    }
  }

  // 2) Remarketing: registrados hace 2 a 72 horas, sin pedido enviado desde la web.
  const now = Date.now();
  const { data: clientes, error } = await sb
    .from("clientes_web")
    .select("id, full_name, email, creado_en, cupon_usado_en, carrito, ultimo_pedido_en")
    .is("ultimo_pedido_en", null)
    .lte("creado_en", new Date(now - 2 * HOUR).toISOString())
    .gte("creado_en", new Date(now - 72 * HOUR).toISOString());
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const results = { dry_run: dryRun, reintentos_pendientes: reintentos, revisados: clientes?.length || 0, elegibles: 0, enviados: 0, errores: 0 };
  const catalog = clientes?.length ? await loadCatalog() : new Map();

  for (const c of clientes || []) {
    const age = (now - new Date(c.creado_en).getTime()) / HOUR;
    const tier = TIERS.find(([, from, to]) => age >= from && age < to);
    if (!tier) continue;
    const tipo = tier[0];

    const { data: sent } = await sb.from("clientes_web_correos").select("tipo").eq("cliente_id", c.id).like("tipo", "remarketing_%");
    const sentTypes = new Set((sent || []).map((r: any) => r.tipo));
    const tierIndex = TIERS.findIndex(([t]) => t === tipo);
    // Ya recibió este tramo o uno posterior: nada que hacer.
    if (TIERS.slice(tierIndex).some(([t]) => sentTypes.has(t))) continue;

    results.elegibles++;
    if (dryRun) continue;

    // Reclamar antes de enviar (unique cliente+tipo): evita dobles envíos si dos ejecuciones se cruzan.
    const { error: claimError } = await sb.from("clientes_web_correos").insert({ cliente_id: c.id, tipo, ref: "" });
    if (claimError) continue;
    try {
      await sendEmail(c.email, COPY[tipo].subject, buildHtml(tipo, c, productFor(c.carrito, catalog)));
      results.enviados++;
    } catch (err) {
      await sb.from("clientes_web_correos").delete().eq("cliente_id", c.id).eq("tipo", tipo);
      console.error("No se pudo enviar remarketing", tipo, c.id, err);
      results.errores++;
    }
  }

  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
});
