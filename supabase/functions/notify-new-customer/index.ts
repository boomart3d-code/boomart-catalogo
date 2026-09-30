// Aviso interno cuando un cliente completa su perfil en "Mi cuenta" por
// PRIMERA VEZ en boomart.pe (pedido de Adrian, 2026-09-29): quiere saber en
// el momento quien se registra, llegue o no a comprar despues. El cliente
// NUNCA se entera de este correo -- es solo para boomart.3d@gmail.com.
//
// Se invoca desde el navegador (src/account.js, supabase.functions.invoke)
// justo despues de guardar el perfil por primera vez (no en cada edicion
// posterior). verify_jwt=true: solo una sesion logueada puede llamarla (el
// propio cliente que se acaba de registrar).
//
// Secrets que necesita (ya existen en este proyecto, reusados de
// send-cart-reminders): RESEND_API_KEY

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const NOTIFY_TO = "boomart.3d@gmail.com";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function esc(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c],
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Metodo no permitido" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_err) {
    return json({ error: "JSON invalido" }, 400);
  }

  const nombre = String(body.nombre || "").trim();
  const apellido = String(body.apellido || "").trim();
  const correo = String(body.correo || "").trim();
  const telefono = String(body.telefono || "").trim();
  const tipoDocumento = String(body.tipoDocumento || "").trim();
  const numeroDocumento = String(body.numeroDocumento || "").trim();
  // Carrito al momento del registro (pedido de Adrian, 2026-09-29): lineas ya
  // resueltas que manda cart.js/account.js (nombre, variante, cantidad,
  // precio, subtotal) -- esta funcion solo las formatea, no consulta nada.
  const carrito = Array.isArray(body.carrito) ? body.carrito : [];

  const nombreCompleto = [nombre, apellido].filter(Boolean).join(" ");
  const fecha = new Date().toLocaleString("es-PE", { timeZone: "America/Lima" });

  const rows: [string, string][] = [
    ["Nombre", nombreCompleto || "(no indicado)"],
    ["Correo", correo || "(no indicado)"],
    ["Teléfono", telefono || "(no indicado)"],
    ["Documento", numeroDocumento ? `${tipoDocumento || "Doc."} ${numeroDocumento}` : "(no indicado)"],
    ["Fecha de registro", fecha],
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:6px 12px;color:#888;font-size:14px;white-space:nowrap;">${esc(label)}</td>
          <td style="padding:6px 12px;color:#222;font-size:14px;font-weight:700;">${esc(value)}</td>
        </tr>`,
    )
    .join("");

  let cartTotal = 0;
  const cartRowsHtml = carrito.length
    ? carrito
        .map((item: any) => {
          const qty = Number(item?.quantity) || 1;
          const unitPrice = Number(item?.unitPrice) || 0;
          const subtotal = Number(item?.subtotal) || unitPrice * qty;
          cartTotal += subtotal;
          const variantPart = item?.variantLabel ? ` (${esc(item.variantLabel)})` : "";
          return `
            <tr>
              <td style="padding:5px 12px;color:#222;font-size:14px;">${qty}x ${esc(item?.name || "producto")}${variantPart}</td>
              <td style="padding:5px 12px;color:#222;font-size:14px;text-align:right;">S/ ${subtotal.toFixed(2)}</td>
            </tr>`;
        })
        .join("")
    : `<tr><td style="padding:5px 12px;color:#888;font-size:14px;" colspan="2">Carrito vacío en el momento del registro</td></tr>`;

  const cartSectionHtml = `
    <div style="margin-top:18px;">
      <p style="font-size:14px;color:#555;font-weight:700;margin:0 0 6px;">Carrito al momento del registro</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:6px;overflow:hidden;">
        ${cartRowsHtml}
        ${
          carrito.length
            ? `<tr><td style="padding:6px 12px;color:#555;font-size:13px;border-top:1px solid #eee;">Total</td><td style="padding:6px 12px;color:#222;font-size:13px;font-weight:700;text-align:right;border-top:1px solid #eee;">S/ ${cartTotal.toFixed(2)}</td></tr>`
            : ""
        }
      </table>
    </div>
  `;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
      <div style="background:#e1132f;padding:18px 22px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;color:#fff;font-size:19px;">Nuevo registro en boomart.pe</h1>
      </div>
      <div style="padding:18px 22px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px;">
        <p style="font-size:14px;color:#555;margin-top:0;">Aviso interno -- el cliente no recibe copia de este correo.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
        ${cartSectionHtml}
      </div>
    </div>
  `;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "BoomArt <contacto@boomart.pe>",
        to: NOTIFY_TO,
        subject: `Nuevo registro: ${nombreCompleto || correo || "cliente"}`,
        html,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return json({ error: `Resend error ${resp.status}: ${text}` }, 502);
    }
  } catch (err) {
    return json({ error: String(err) }, 500);
  }

  return json({ ok: true });
});
