// Fase 4: recordatorio de carrito abandonado.
//
// Se dispara periodicamente por un Cron Job de Supabase (ver panel:
// Database > Cron Jobs, o Edge Functions > Schedules). Revisa los carritos
// "activos" y, segun cuanto tiempo paso desde su ultima actividad
// (actualizado_en), manda un correo (via Resend) a 1h / 24h / 48h -- cada
// uno una sola vez (recordatorios_carrito evita repetirlo). Sin descuento
// por ahora (Adrian lo pedira mas adelante cuando quiera activarlo).
//
// Si el cliente ya completo la compra, el carrito pasa a estado
// "completado" (checkout.js dispara "boomart:order-sent") y este job lo
// ignora automaticamente porque solo mira estado = 'activo'.
//
// Secrets que necesita este proyecto (Edge Functions > Secrets):
//   RESEND_API_KEY     -> clave de Resend (sending access)
//   SB_SERVICE_ROLE_KEY -> la misma service_role key que usa Boomart Studio

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const CATALOG_URL = "https://boomart.pe/data/products.json";
const SITE_URL = "https://boomart.pe/";
const ASSETS_BASE = "https://boomart.pe/";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type ReminderTier = {
  tipo: string;
  horas: number;
  asunto: string;
  titulo: string;
  mensaje: string;
};

const TIERS: ReminderTier[] = [
  {
    tipo: "recordatorio_1h",
    horas: 1,
    asunto: "Se te quedó algo en el carrito 👀",
    titulo: "¡Tu pedido casi está listo!",
    mensaje:
      "Dejaste estas piezas increíbles en tu carrito. No las dejes ir -- termina tu compra en un par de clics.",
  },
  {
    tipo: "recordatorio_24h",
    horas: 24,
    asunto: "Sigue esperándote tu pedido en BoomArt",
    titulo: "Tus piezas favoritas siguen reservadas",
    mensaje:
      "Ya casi son tuyas. Estos productos siguen guardados en tu carrito -- complétalo antes de que se agoten.",
  },
  {
    tipo: "recordatorio_48h",
    horas: 48,
    asunto: "Último recordatorio: no pierdas tu pedido",
    titulo: "Última oportunidad para completar tu pedido",
    mensaje:
      "Han pasado 2 días y tu carrito sigue intacto. Si tienes alguna duda, escríbenos por WhatsApp -- queremos ayudarte a tener esta pieza en tus manos.",
  },
];

const VARIANT_LABELS: Record<string, string> = {
  temple: "Templo",
  pandora: "Pandora Box + pedestal",
  combo: "Combo (templo + Pandora Box)",
};

function formatPrice(value: number): string {
  return Number.isInteger(value) ? `S/ ${value}` : `S/ ${value.toFixed(2)}`;
}

function resolveLine(item: any, catalog: Map<string, any>) {
  const product = catalog.get(item.productId);
  const qty = item.quantity || 1;
  if (!product) {
    return { name: item.productId, variantLabel: null, image: null, unitPrice: 0, qty };
  }
  let unitPrice = 0;
  let variantLabel: string | null = null;
  if (product.templePricing && item.variant && product.templePricing[item.variant] != null) {
    unitPrice = Number(product.templePricing[item.variant]);
    variantLabel = VARIANT_LABELS[item.variant] || null;
  } else {
    unitPrice = Number(product.offerPrice != null ? product.offerPrice : product.regularPrice) || 0;
  }
  const image = product.image ? `${ASSETS_BASE}${product.image}` : null;
  return { name: product.name || item.productId, variantLabel, image, unitPrice, qty };
}

function itemsToHtml(items: any[], catalog: Map<string, any>): { html: string; total: number } {
  let total = 0;
  const rows = items.map((item) => {
    const line = resolveLine(item, catalog);
    total += line.unitPrice * line.qty;
    const imageCell = line.image
      ? `<td style="width:96px;padding:0;">
          <img src="${line.image}" width="96" height="96" alt="${line.name}" style="display:block;width:96px;height:96px;object-fit:cover;border-radius:8px 0 0 8px;" />
        </td>`
      : "";
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0;border:1px solid #eee;border-radius:8px;overflow:hidden;">
        <tr>
          ${imageCell}
          <td style="padding:14px 16px;vertical-align:middle;">
            <div style="font-size:16px;font-weight:700;color:#222;">${line.name}</div>
            ${line.variantLabel ? `<div style="font-size:13px;color:#888;margin-top:2px;">${line.variantLabel}</div>` : ""}
            <div style="font-size:15px;color:#e1132f;font-weight:700;margin-top:6px;">
              ${line.qty > 1 ? `${line.qty} x ` : ""}${formatPrice(line.unitPrice)}
            </div>
          </td>
        </tr>
      </table>`;
  });
  return { html: rows.join(""), total };
}

async function loadCatalog(): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  try {
    const resp = await fetch(CATALOG_URL);
    if (!resp.ok) return map;
    const products = await resp.json();
    if (Array.isArray(products)) {
      for (const p of products) map.set(p.id, p);
    }
  } catch (_err) {
    // Sin catalogo disponible: igual mandamos el correo, solo que con los
    // ids de producto crudos en vez del nombre bonito.
  }
  return map;
}

async function sendReminderEmail(
  to: string,
  nombre: string,
  tier: ReminderTier,
  itemsHtml: string,
  total: number,
) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;background:#fff;">
      <div style="background:#e1132f;padding:22px 24px;border-radius:10px 10px 0 0;">
        <h1 style="margin:0;color:#fff;font-size:24px;line-height:1.3;">${tier.titulo}</h1>
      </div>
      <div style="padding:24px;">
        <p style="font-size:16px;color:#333;margin-top:0;">Hola ${nombre || ""},</p>
        <p style="font-size:16px;color:#333;line-height:1.5;">${tier.mensaje}</p>
        <div style="margin:20px 0;">${itemsHtml}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
          <tr>
            <td style="font-size:15px;color:#555;">Total estimado</td>
            <td style="font-size:18px;color:#222;font-weight:700;text-align:right;">${formatPrice(total)}</td>
          </tr>
        </table>
        <div style="text-align:center;">
          <a href="${SITE_URL}" style="background:#e1132f;color:#fff;padding:16px 32px;border-radius:8px;text-decoration:none;display:inline-block;font-size:17px;font-weight:700;">
            Completar mi compra
          </a>
        </div>
        <p style="color:#999;font-size:12px;text-align:center;margin-top:28px;">BoomArt · boomart.pe</p>
      </div>
    </div>
  `;
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "BoomArt <contacto@boomart.pe>",
      to,
      subject: tier.asunto,
      html,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Resend error ${resp.status}: ${text}`);
  }
}

Deno.serve(async (_req) => {
  const now = Date.now();
  const catalog = await loadCatalog();

  const { data: carritos, error: carritosError } = await sb
    .from("carritos")
    .select("id, items, actualizado_en, cliente_id, clientes(correo, nombre)")
    .eq("estado", "activo");

  if (carritosError) {
    return new Response(JSON.stringify({ error: carritosError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results: Record<string, number> = {
    recordatorio_1h: 0,
    recordatorio_24h: 0,
    recordatorio_48h: 0,
    omitidos: 0,
    errores: 0,
  };

  for (const carrito of carritos || []) {
    const cliente = (carrito as any).clientes;
    if (!cliente || !cliente.correo) {
      results.omitidos++;
      continue;
    }
    const items = Array.isArray(carrito.items) ? carrito.items : [];
    if (!items.length) {
      results.omitidos++;
      continue;
    }
    const elapsedHours =
      (now - new Date(carrito.actualizado_en).getTime()) / 3600000;

    for (const tier of TIERS) {
      if (elapsedHours < tier.horas) continue;

      const { data: existing } = await sb
        .from("recordatorios_carrito")
        .select("id")
        .eq("carrito_id", carrito.id)
        .eq("tipo", tier.tipo)
        .maybeSingle();
      if (existing) continue;

      try {
        const { html: itemsHtml, total } = itemsToHtml(items, catalog);
        await sendReminderEmail(cliente.correo, cliente.nombre, tier, itemsHtml, total);
        await sb
          .from("recordatorios_carrito")
          .insert({ carrito_id: carrito.id, tipo: tier.tipo });
        results[tier.tipo]++;
      } catch (err) {
        console.error("Error enviando recordatorio", carrito.id, tier.tipo, err);
        results.errores++;
      }
    }
  }

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
});
