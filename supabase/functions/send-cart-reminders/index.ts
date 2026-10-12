// Recordatorio unico de registro incompleto.
//
// El cron existente invoca esta funcion cada 15 minutos. Solo contacta a una
// persona cuando pasaron al menos 24 horas desde su registro, no existe ningun
// carrito completado y nunca recibio antes un correo de 24 horas. Conservamos
// tambien el historial del sistema anterior para no duplicar mensajes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const CATALOG_URL = "https://boomart.pe/data/products.json";
const SITE_URL = "https://boomart.pe/";
const ASSETS_BASE = "https://boomart.pe/";
const GENERIC_IMAGE = `${ASSETS_BASE}assets/boomart-og.jpg`;
const ADMIN_BCC = "boomart.3d@gmail.com";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadCatalog(): Promise<Map<string, any>> {
  const catalog = new Map<string, any>();
  try {
    const response = await fetch(CATALOG_URL);
    if (!response.ok) return catalog;
    const products = await response.json();
    if (Array.isArray(products)) {
      for (const product of products) catalog.set(product.id, product);
    }
  } catch (_error) {
    // La imagen institucional permite enviar un correo util aunque el catalogo
    // no este disponible durante esta ejecucion.
  }
  return catalog;
}

function emailContext(items: any[], catalog: Map<string, any>) {
  const firstItem = Array.isArray(items) ? items[0] : null;
  const productId = String(firstItem?.productId || "");
  const product = productId ? catalog.get(productId) : null;
  if (!product) {
    return {
      image: GENERIC_IMAGE,
      imageAlt: "Productos de BoomArt",
      destination: SITE_URL,
      productName: "",
    };
  }
  return {
    image: product.image ? `${ASSETS_BASE}${product.image}` : GENERIC_IMAGE,
    imageAlt: product.name || "Producto de BoomArt",
    destination: `${SITE_URL}producto/${encodeURIComponent(productId)}/`,
    productName: String(product.name || ""),
  };
}

function buildHtml(nombre: string, context: ReturnType<typeof emailContext>) {
  const remembered = context.productName
    ? `<p style="margin:0 0 18px;color:#555;font-size:15px;line-height:1.55;">La pieza que estabas revisando, <strong>${esc(context.productName)}</strong>, sigue disponible para que continúes cuando estés listo.</p>`
    : `<p style="margin:0 0 18px;color:#555;font-size:15px;line-height:1.55;">Puedes volver a explorar nuestras piezas y continuar tu compra cuando estés listo.</p>`;

  return `
    <div style="background:#f5f5f5;padding:24px 12px;font-family:Arial,sans-serif;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #ececec;">
        <div style="background:#171717;padding:18px 24px;text-align:center;">
          <img src="${ASSETS_BASE}assets/boomart-logo-1.png" width="150" alt="BoomArt" style="display:inline-block;max-width:150px;height:auto;" />
        </div>
        <img src="${esc(context.image)}" width="560" alt="${esc(context.imageAlt)}" style="display:block;width:100%;max-height:310px;object-fit:cover;" />
        <div style="padding:26px 26px 22px;">
          <h1 style="margin:0 0 14px;color:#222;font-size:23px;line-height:1.3;">¿Encontraste lo que buscabas?</h1>
          <p style="margin:0 0 14px;color:#333;font-size:16px;line-height:1.55;">Hola${nombre ? ` ${esc(nombre)}` : ""}, gracias por registrarte en BoomArt.</p>
          ${remembered}
          <p style="margin:0 0 22px;color:#555;font-size:15px;line-height:1.55;">Si tienes alguna consulta sobre medidas, disponibilidad o entrega, estamos para ayudarte.</p>
          <div style="text-align:center;">
            <a href="${esc(context.destination)}" style="background:#e1132f;color:#fff;padding:14px 26px;border-radius:8px;text-decoration:none;display:inline-block;font-size:16px;font-weight:700;">Continuar viendo productos</a>
          </div>
          <p style="margin:24px 0 0;color:#999;font-size:12px;line-height:1.5;text-align:center;">Recibes este correo porque creaste una cuenta en boomart.pe. Este recordatorio se envía una sola vez.</p>
        </div>
      </div>
    </div>`;
}

async function sendEmail(to: string, nombre: string, context: ReturnType<typeof emailContext>) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "BoomArt <contacto@boomart.pe>",
      to,
      bcc: ADMIN_BCC,
      subject: "¿Encontraste lo que buscabas en BoomArt?",
      html: buildHtml(nombre, context),
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend error ${response.status}: ${await response.text()}`);
  }
}

Deno.serve(async (request) => {
  let dryRun = false;
  try {
    const body = await request.json();
    dryRun = body?.dry_run === true;
  } catch (_error) {
    // Las llamadas del cron pueden no incluir un cuerpo JSON valido.
  }

  const cutoff = new Date(Date.now() - 24 * 3600000).toISOString();
  const catalog = await loadCatalog();
  const { data: customers, error: customerError } = await sb
    .from("clientes")
    .select("id, nombre, correo, creado_en")
    .lte("creado_en", cutoff)
    .order("creado_en", { ascending: true });

  if (customerError) {
    return new Response(JSON.stringify({ error: customerError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results = {
    dry_run: dryRun,
    revisados: customers?.length || 0,
    elegibles: 0,
    enviados: 0,
    ya_contactados: 0,
    con_compra: 0,
    errores: 0,
  };

  for (const customer of customers || []) {
    const { data: carts, error: cartError } = await sb
      .from("carritos")
      .select("id, items, estado, actualizado_en")
      .eq("cliente_id", customer.id)
      .order("actualizado_en", { ascending: false });
    if (cartError) {
      results.errores++;
      continue;
    }

    if ((carts || []).some((cart: any) => cart.estado === "completado")) {
      results.con_compra++;
      continue;
    }

    const { data: registrationReminder } = await sb
      .from("recordatorios_registro")
      .select("id")
      .eq("cliente_id", customer.id)
      .eq("tipo", "registro_24h")
      .maybeSingle();

    const cartIds = (carts || []).map((cart: any) => cart.id);
    let oldReminder = null;
    if (cartIds.length) {
      const previous = await sb
        .from("recordatorios_carrito")
        .select("id")
        .in("carrito_id", cartIds)
        .eq("tipo", "recordatorio_24h")
        .limit(1)
        .maybeSingle();
      oldReminder = previous.data;
    }

    if (registrationReminder || oldReminder) {
      results.ya_contactados++;
      continue;
    }

    results.elegibles++;
    if (dryRun) continue;

    const activeCart = (carts || []).find(
      (cart: any) => cart.estado === "activo" && Array.isArray(cart.items) && cart.items.length,
    );
    const context = emailContext(activeCart?.items || [], catalog);
    try {
      await sendEmail(customer.correo, customer.nombre, context);
      const { error: insertError } = await sb
        .from("recordatorios_registro")
        .insert({ cliente_id: customer.id, tipo: "registro_24h" });
      if (insertError) throw insertError;
      results.enviados++;
    } catch (error) {
      console.error("No se pudo enviar recordatorio de registro", customer.id, error);
      results.errores++;
    }
  }

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
});
