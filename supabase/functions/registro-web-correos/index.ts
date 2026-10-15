// Correos del registro web (pedido de Adrián, 2026-10-15).
//
//  * "bienvenida" -> al CLIENTE apenas se registra en boomart.pe: agradece, le
//    confirma que su registro quedó hecho, le recuerda su cupón del 10 % (solo
//    Yape, Plin o transferencia, finalizando la compra en la web) e incluye el
//    botón "Confirmar mi registro" (no bloquea nada; marca el correo confirmado).
//  * "aviso_registro" / "aviso_actualizacion" -> a BoomArt, con los datos y el
//    CÓDIGO para importarlo en BoomArt Studio (Clientes web > Importar por código).
//
// La dispara la función SQL registro_web_guardar (pg_net) con {cliente_id}; el
// cron de remarketing la vuelve a llamar sin cuerpo para reintentar lo que haya
// quedado pendiente. Es idempotente: cada correo se "reclama" en
// clientes_web_correos (enviado_en = 'epoch' -> now()) antes de enviarse, así que
// nunca sale dos veces aunque la llamen varias veces. verify_jwt = false.
//
// Secrets: RESEND_API_KEY, SB_SERVICE_ROLE_KEY (los mismos de send-cart-reminders).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const ADMIN_TO = "boomart.3d@gmail.com";
const SITE = "https://boomart.pe";
const EPOCH = "1970-01-01T00:00:00+00:00";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const DOC_LABELS: Record<string, string> = { dni: "DNI", ce: "Carné de extranjería", pasaporte: "Pasaporte" };
const DELIVERY_LABELS: Record<string, string> = {
  indriver: "Envío local (InDrive)",
  shalom: "Envío por Shalom",
  pickup: "Recojo coordinado",
};

function esc(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c],
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function firstName(full: string): string {
  return String(full || "").trim().split(/\s+/)[0] || "";
}

function deliveryText(c: any): string {
  if (c.delivery_method === "indriver") {
    return [c.local_district, c.local_address, c.local_reference].filter(Boolean).join(" · ") || "(sin dirección)";
  }
  if (c.delivery_method === "shalom") {
    const place = [c.shalom_district, c.shalom_province, c.shalom_department].filter(Boolean).join(", ");
    return [c.shalom_name, c.shalom_address, place].filter(Boolean).join(" · ") || "(sin agencia)";
  }
  if (c.delivery_method === "pickup") return "Recojo coordinado con BoomArt";
  return "(no indicó — coordinar por WhatsApp)";
}

function shell(title: string, body: string) {
  return `
  <div style="background:#f4f0e8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d8d2c9;">
      <div style="background:#0b0b0b;padding:18px 24px;border-bottom:4px solid #e1132f;">
        <img src="${SITE}/assets/boomart-logo-1.png" width="140" alt="BoomArt" style="display:block;max-width:140px;height:auto;">
      </div>
      <div style="padding:26px 26px 24px;">
        <h1 style="margin:0 0 14px;color:#0b0b0b;font-size:22px;line-height:1.3;">${title}</h1>
        ${body}
      </div>
    </div>
  </div>`;
}

function welcomeHtml(c: any, confirmToken: string) {
  const name = esc(firstName(c.full_name));
  const confirmUrl = `${SITE}/?confirmar=${encodeURIComponent(confirmToken)}`;
  const coupon = c.cupon_usado_en
    ? ""
    : `<div style="margin:0 0 20px;padding:16px 18px;background:#f4f0e8;border-left:4px solid #e1132f;">
         <p style="margin:0 0 6px;color:#0b0b0b;font-size:17px;font-weight:700;">Tienes 10 % de descuento en tu primera compra</p>
         <p style="margin:0;color:#514c46;font-size:14px;line-height:1.55;">Se aplica solo al pagar con <strong>Yape, Plin o transferencia bancaria</strong> y finalizando tu compra en <strong>boomart.pe</strong>. Se descuenta automáticamente en tu carrito.</p>
       </div>`;
  return shell(
    `¡Gracias por registrarte${name ? `, ${name}` : ""}!`,
    `<p style="margin:0 0 14px;color:#2e2b28;font-size:16px;line-height:1.55;">Tu registro en <strong>boomart.pe</strong> quedó hecho. Con tus datos ya podemos atender tus pedidos más rápido.</p>
     ${coupon}
     <p style="margin:0 0 18px;color:#2e2b28;font-size:15px;line-height:1.55;">Por favor, confirma que este correo es tuyo:</p>
     <div style="text-align:center;margin:0 0 22px;">
       <a href="${confirmUrl}" style="background:#e1132f;color:#ffffff;padding:14px 28px;text-decoration:none;display:inline-block;font-size:16px;font-weight:700;">Confirmar mi registro</a>
     </div>
     <p style="margin:0 0 6px;color:#514c46;font-size:14px;line-height:1.55;">¿Dudas sobre medidas, materiales o entregas? Respóndenos este correo o escríbenos por WhatsApp al 925 666 542.</p>
     <p style="margin:18px 0 0;color:#6f6961;font-size:12px;line-height:1.5;">Recibes este correo porque te registraste en boomart.pe con ${esc(c.email)}. Si no fuiste tú, puedes ignorarlo.</p>`,
  );
}

function adminHtml(c: any, code: string, isUpdate: boolean) {
  const rows: [string, string][] = [
    ["Nombre", c.full_name],
    ["WhatsApp", c.phone],
    ["Correo", c.email],
    ["Documento", `${DOC_LABELS[c.document_type] || c.document_type} ${c.document_number}`],
    ["Entrega", DELIVERY_LABELS[c.delivery_method] || "No indicó"],
    ["Dirección / agencia", deliveryText(c)],
    ["Cupón 10 %", c.cupon_usado_en ? "Ya usado" : "Disponible"],
    ["Registrado desde", c.origen || "boomart.pe"],
    ["Fecha", new Date(c.actualizado_en || c.creado_en).toLocaleString("es-PE", { timeZone: "America/Lima" })],
  ];
  const rowsHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:6px 10px;color:#6f6961;font-size:14px;white-space:nowrap;vertical-align:top;">${esc(label)}</td>
      <td style="padding:6px 10px;color:#0b0b0b;font-size:14px;font-weight:700;">${esc(value)}</td>
    </tr>`).join("");
  return shell(
    isUpdate ? "Cliente actualizó sus datos en boomart.pe" : "Nuevo cliente registrado en boomart.pe",
    `<p style="margin:0 0 6px;color:#514c46;font-size:14px;">Código para importarlo en BoomArt Studio:</p>
     <p style="margin:0 0 18px;font-family:Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:2px;color:#e1132f;">${esc(code)}</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #d8d2c9;">${rowsHtml}</table>
     <p style="margin:18px 0 0;color:#6f6961;font-size:12px;line-height:1.5;">BoomArt Studio → Clientes web → pega el código en «Importar por código». ${isUpdate ? "El cliente ya existía; Studio lo actualizará por su teléfono." : ""} Aviso interno: el cliente no recibe este correo.</p>`,
  );
}

async function sendEmail(to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "BoomArt <contacto@boomart.pe>", to, reply_to: "contacto@boomart.pe", subject, html }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);
}

async function processRow(row: any) {
  // Reclamar el envío: solo una llamada puede pasar de 'epoch' a now().
  const { data: claimed } = await sb
    .from("clientes_web_correos")
    .update({ enviado_en: new Date().toISOString() })
    .eq("id", row.id)
    .eq("enviado_en", EPOCH)
    .select("id")
    .maybeSingle();
  if (!claimed) return "ya_enviado";

  const { data: c, error } = await sb.from("clientes_web").select("*").eq("id", row.cliente_id).maybeSingle();
  if (error || !c) return "sin_cliente";
  try {
    if (row.tipo === "bienvenida") {
      await sendEmail(c.email, "Tu registro en BoomArt está listo · 10 % en tu primera compra", welcomeHtml(c, row.ref));
    } else {
      const isUpdate = row.tipo === "aviso_actualizacion";
      await sendEmail(
        ADMIN_TO,
        `${isUpdate ? "Datos actualizados" : "Nuevo registro"}: ${c.full_name} · ${row.ref}`,
        adminHtml(c, row.ref, isUpdate),
      );
    }
    return "enviado";
  } catch (err) {
    // Devolver a pendiente para que el cron lo reintente.
    await sb.from("clientes_web_correos").update({ enviado_en: EPOCH }).eq("id", row.id);
    console.error("No se pudo enviar", row.tipo, row.cliente_id, err);
    return "error";
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Metodo no permitido" }, 405);
  let clienteId = "";
  try {
    const body = await req.json();
    clienteId = typeof body?.cliente_id === "string" ? body.cliente_id : "";
  } catch (_err) {
    // sin cuerpo: modo reintento
  }

  let query = sb
    .from("clientes_web_correos")
    .select("id, cliente_id, tipo, ref")
    .eq("enviado_en", EPOCH)
    .in("tipo", ["bienvenida", "aviso_registro", "aviso_actualizacion"])
    .limit(50);
  if (clienteId) {
    if (!/^[0-9a-f-]{36}$/i.test(clienteId)) return json({ error: "cliente_id no valido" }, 400);
    query = query.eq("cliente_id", clienteId);
  }
  const { data: rows, error } = await query;
  if (error) return json({ error: error.message }, 500);

  const results: Record<string, number> = {};
  for (const row of rows || []) {
    const r = await processRow(row);
    results[r] = (results[r] || 0) + 1;
  }
  return json({ ok: true, revisados: rows?.length || 0, ...results });
});
