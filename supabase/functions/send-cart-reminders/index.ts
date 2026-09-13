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
    asunto: "¿Se te quedó algo en el carrito?",
    titulo: "Tu carrito te está esperando",
    mensaje:
      "Notamos que dejaste estos productos en tu carrito hace un rato. Si tienes alguna duda para completar tu pedido, escríbenos por WhatsApp o vuelve a boomart.pe cuando quieras.",
  },
  {
    tipo: "recordatorio_24h",
    horas: 24,
    asunto: "Tu carrito en BoomArt sigue esperándote",
    titulo: "Todavía tienes tu carrito guardado",
    mensaje:
      "Ha pasado un día desde que armaste tu pedido en BoomArt y aún no lo completas. Tus productos siguen guardados -- entra a boomart.pe para continuar cuando quieras.",
  },
  {
    tipo: "recordatorio_48h",
    horas: 48,
    asunto: "Último recordatorio: tu pedido en BoomArt",
    titulo: "¿Seguimos con tu pedido?",
    mensaje:
      "Han pasado 2 días desde que armaste tu pedido y todavía no lo completas. Si tienes alguna consulta o necesitas ayuda para terminar tu compra, escríbenos por WhatsApp -- con gusto te ayudamos.",
  },
];

function itemsToHtml(items: any[], catalog: Map<string, any>): string {
  return items
    .map((item) => {
      const product = catalog.get(item.productId);
      const name = product ? product.name : item.productId;
      const qty = item.quantity || 1;
      return `<li>${qty}x ${name}</li>`;
    })
    .join("");
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
) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="color:#e1132f;">${tier.titulo}</h2>
      <p>Hola ${nombre || ""},</p>
      <p>${tier.mensaje}</p>
      <ul>${itemsHtml}</ul>
      <p><a href="${SITE_URL}" style="background:#e1132f;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Continuar mi compra</a></p>
      <p style="color:#888;font-size:12px;">BoomArt · boomart.pe</p>
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
        await sendReminderEmail(
          cliente.correo,
          cliente.nombre,
          tier,
          itemsToHtml(items, catalog),
        );
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
