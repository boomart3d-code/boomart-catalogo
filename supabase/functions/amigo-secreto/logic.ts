// Lógica pura del Amigo Secreto por correo: validación, sorteo, ideas de regalo y correos.
// Sin dependencias remotas para poder probarla con Node (node --test) y usarla desde Deno.

export const SITE = "https://boomart.pe";
export const MIN_P = 3;
export const MAX_P = 60;
export const CODIGO_DESCUENTO = "AMIGO10";
export const WHATSAPP = "https://wa.me/51925666542";
// Texto exacto que acepta quien toca "Sí, quiero recibir ofertas" (se guarda con la fecha).
export const TEXTO_CONSENTIMIENTO =
  "Acepto que BoomArt guarde mi nombre y correo para enviarme ofertas y novedades de sus productos. " +
  "Puedo darme de baja cuando quiera desde cualquier correo. Versión 2026-11-26.";

export const TIPOS: Record<string, string> = {
  familia: "en familia",
  oficina: "de la oficina",
  colegio: "del colegio",
  universidad: "de la universidad",
  amigos: "entre amigos",
  otro: "",
};

export type Participante = { nombre: string; email: string };
export type Sorteo = {
  evento: string;
  tipo: string;
  fecha: string | null; // AAAA-MM-DD
  presupuesto: number | null;
  nota: string;
  modo: "secreto" | "admin";
  organizador: Participante;
  participantes: Participante[];
  excepciones: [number, number][];
};
export type Producto = { name: string; url: string; image?: string; priceFrom?: number | string; category?: string };

export function esc(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c],
  );
}

const txt = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
export const normEmail = (v: unknown) => String(v ?? "").trim().toLowerCase().slice(0, 254);
export const esEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e) && e.length <= 254;

// Valida lo que envía la página. Devuelve el sorteo limpio o un mensaje para mostrar.
export function validar(body: any): { ok: true; sorteo: Sorteo } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Datos incompletos." };
  if (body.web) return { ok: false, error: "No se pudo procesar." }; // campo trampa para robots
  if (body.acepta !== true) return { ok: false, error: "Confirma que los participantes saben que recibirán el correo." };
  const evento = txt(body.evento, 80) || "Amigo Secreto";
  const tipo = Object.prototype.hasOwnProperty.call(TIPOS, body.tipo) ? String(body.tipo) : "otro";
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha || "")) ? String(body.fecha) : null;
  const pres = body.presupuesto === "" || body.presupuesto == null ? null : Math.round(Number(body.presupuesto));
  if (pres !== null && (!Number.isFinite(pres) || pres < 0 || pres > 100000)) return { ok: false, error: "Revisa el presupuesto." };
  const nota = txt(body.nota, 300);
  const modo = body.modo === "admin" ? "admin" : "secreto";
  const organizador = { nombre: txt(body.organizador?.nombre, 60), email: normEmail(body.organizador?.email) };
  if (!organizador.nombre) return { ok: false, error: "Escribe tu nombre como organizador." };
  if (!esEmail(organizador.email)) return { ok: false, error: "Revisa tu correo de organizador." };
  if (!Array.isArray(body.participantes)) return { ok: false, error: "Faltan los participantes." };
  const participantes = body.participantes.map((p: any) => ({ nombre: txt(p?.nombre, 40), email: normEmail(p?.email) }));
  if (participantes.length < MIN_P) return { ok: false, error: `Se necesitan al menos ${MIN_P} participantes.` };
  if (participantes.length > MAX_P) return { ok: false, error: `El máximo es ${MAX_P} participantes.` };
  const nombres = new Set<string>(), correos = new Set<string>();
  for (const p of participantes) {
    if (!p.nombre) return { ok: false, error: "Hay un participante sin nombre." };
    if (!esEmail(p.email)) return { ok: false, error: `Revisa el correo de ${p.nombre}.` };
    const n = p.nombre.toLocaleLowerCase("es");
    if (nombres.has(n)) return { ok: false, error: `El nombre «${p.nombre}» está repetido. Agrega un apellido o inicial.` };
    if (correos.has(p.email)) return { ok: false, error: `El correo de ${p.nombre} está repetido.` };
    nombres.add(n); correos.add(p.email);
  }
  const excepciones: [number, number][] = [];
  for (const e of Array.isArray(body.excepciones) ? body.excepciones.slice(0, 200) : []) {
    const a = Number(e?.[0]), b = Number(e?.[1]);
    if (Number.isInteger(a) && Number.isInteger(b) && a !== b && a >= 0 && b >= 0 && a < participantes.length && b < participantes.length) excepciones.push([a, b]);
  }
  return { ok: true, sorteo: { evento, tipo, fecha, presupuesto: pres, nota, modo, organizador, participantes, excepciones } };
}

// Sorteo: a cada persona le toca alguien distinto de sí misma y de sus excepciones (en ambos sentidos).
// rand() devuelve un entero aleatorio en [0, n). Devuelve to[i] = índice del receptor, o null si no hay forma.
export function sortear(n: number, excepciones: [number, number][], rand: (n: number) => number): number[] | null {
  const banned = new Set<string>();
  for (const [a, b] of excepciones) { banned.add(a + "," + b); banned.add(b + "," + a); }
  const shuffle = (arr: number[]) => { for (let i = arr.length - 1; i > 0; i--) { const j = rand(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  for (let attempt = 0; attempt < 200; attempt++) {
    const order = shuffle([...Array(n).keys()]);
    const used = new Array(n).fill(false), to = new Array(n).fill(-1);
    let steps = 0;
    const go = (k: number): boolean => {
      if (k === n) return true;
      if (++steps > 20000) return false;
      const g = order[k];
      for (const r of shuffle([...Array(n).keys()])) {
        if (used[r] || r === g || banned.has(g + "," + r)) continue;
        used[r] = true; to[g] = r;
        if (go(k + 1)) return true;
        used[r] = false; to[g] = -1;
      }
      return false;
    };
    if (go(0)) return to;
  }
  return null;
}

// Ideas de regalo del catálogo de BoomArt dentro del presupuesto: variadas por categoría,
// las más cercanas al presupuesto primero. Sin presupuesto, piezas de hasta S/ 80.
export function ideasDeRegalo(productos: Producto[], presupuesto: number | null, max = 4): Producto[] {
  const tope = presupuesto && presupuesto > 0 ? presupuesto : 80;
  const lista = productos
    .map((p) => ({ ...p, precio: Number(p.priceFrom) }))
    .filter((p) => p.precio > 0 && p.precio <= tope && p.url && p.name && !/halloween/i.test(p.category || ""))
    .sort((a, b) => b.precio - a.precio);
  const elegidos: typeof lista = [], cats = new Set<string>();
  for (const p of lista) { if (elegidos.length < max && !cats.has(p.category || "")) { elegidos.push(p); cats.add(p.category || ""); } }
  for (const p of lista) { if (elegidos.length < max && !elegidos.includes(p)) elegidos.push(p); }
  return elegidos;
}

export function fechaLarga(f: string | null): string {
  if (!f) return "";
  try { return new Date(f + "T12:00:00Z").toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }); }
  catch { return f; }
}
// «Navidad» de la oficina; pero no «Navidad oficina» de la oficina (no repetir el tipo si ya está en el nombre).
const PALABRAS_TIPO: Record<string, RegExp> = {
  familia: /famil/i, oficina: /oficin|trabajo|empresa/i, colegio: /coleg|escuel|sal[oó]n|aula/i,
  universidad: /univers|facultad/i, amigos: /amig/i, otro: /^$/,
};
const nombreEvento = (s: Sorteo) =>
  `«${s.evento}»${TIPOS[s.tipo] && !(PALABRAS_TIPO[s.tipo] || /^$/).test(s.evento) ? " " + TIPOS[s.tipo] : ""}`;
const pila = (n: string) => String(n || "").trim().split(/\s+/)[0] || "";

// ---------- plantilla común (capa base de marca: fondo blanco, rojo #FF3030, una familia) ----------
function plantilla(cuerpo: string, pie: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#2E2E2E">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:10px;overflow:hidden">
<tr><td style="padding:6px 16px 0;border-bottom:1px solid #D7DBE0"><img src="${SITE}/assets/boomart-logo-1.png" width="140" alt="BoomArt" style="display:block;max-width:140px;height:auto;border:0"></td></tr>
<tr><td style="padding:22px 24px 8px;font-size:15px;line-height:1.55">${cuerpo}</td></tr>
<tr><td style="padding:14px 24px 22px;border-top:1px solid #D7DBE0;font-size:12px;line-height:1.5;color:#5F5F63">${pie}
<br>BoomArt · Bellavista, Callao, Perú · <a href="${SITE}/politicas.html#privacidad" style="color:#5F5F63">Política de privacidad</a></td></tr>
</table></td></tr></table></body></html>`;
}
const boton = (url: string, texto: string, color = "#FF3030") =>
  `<a href="${esc(url)}" style="display:inline-block;background:${color};color:#FFFFFF;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">${esc(texto)}</a>`;

export type Correo = { to: string; subject: string; html: string; text: string };

// Invitación a organizar otro sorteo: cada correo llega a gente que puede tener su propio grupo.
export const urlOrganiza = (medio: string) =>
  `${SITE}/amigo-secreto/?utm_source=amigo-secreto&utm_medium=${medio}&utm_campaign=organiza-el-tuyo`;
const invitaHtml = (pregunta: string) =>
  `<p style="margin:16px 0 0;font-size:13px;color:#5F5F63">${pregunta} <a href="${esc(urlOrganiza("email"))}" style="color:#FF3030;font-weight:700">Organiza tu Amigo Secreto gratis</a>: sorteo por correo o WhatsApp en un minuto.</p>`;
const invitaTxt = (pregunta: string) => `\n\n${pregunta} Organiza tu Amigo Secreto gratis: ${urlOrganiza("email")}`;

// 1) Al organizador: confirmar que el correo es suyo antes de enviar nada.
export function correoConfirmacion(s: Sorteo, url: string): Correo {
  const subject = `Confirma tu Amigo Secreto «${s.evento}»`;
  const html = plantilla(
    `<p style="margin:0 0 12px">Hola ${esc(pila(s.organizador.nombre))},</p>
<p style="margin:0 0 12px">Preparaste el Amigo Secreto <b>${esc(nombreEvento(s))}</b> con <b>${s.participantes.length} participantes</b>.</p>
<p style="margin:0 0 18px">Para enviar los correos, confirma que este correo es tuyo. El enlace vence en 48 horas.</p>
<p style="margin:0 0 18px">${boton(url, "Confirmar y enviar los correos")}</p>
<p style="margin:0;color:#5F5F63;font-size:13px">${s.modo === "admin" ? "Elegiste ser administrador: después de enviarlos, te llegará la lista de quién le regala a quién." : "Elegiste que la página reparta en secreto: nadie, ni siquiera tú, verá a quién le tocó cada uno."}</p>`,
    "Si no preparaste este sorteo, ignora este correo: no se enviará nada.",
  );
  const text = `Hola ${pila(s.organizador.nombre)}:\nConfirma tu Amigo Secreto «${s.evento}» (${s.participantes.length} participantes) para enviar los correos:\n${url}\nEl enlace vence en 48 horas. Si no fuiste tú, ignora este correo.`;
  return { to: s.organizador.email, subject, html, text };
}

// 2) A cada participante: su amigo secreto, datos del intercambio, ideas de regalo y el botón de ofertas.
export function correoParticipante(s: Sorteo, i: number, receptor: string, ideas: Producto[], ofertasUrl: string): Correo {
  const p = s.participantes[i];
  const subject = `🎁 Tu Amigo Secreto de «${s.evento}»`;
  const datos = [
    s.presupuesto ? `<b>Presupuesto:</b> S/ ${s.presupuesto}` : "",
    s.fecha ? `<b>Intercambio:</b> ${esc(fechaLarga(s.fecha))}` : "",
    s.nota ? `<b>Nota:</b> ${esc(s.nota)}` : "",
  ].filter(Boolean).join("<br>");
  const utm = "utm_source=amigo-secreto&utm_medium=email&utm_campaign=amigo-secreto-2026";
  const ideasHtml = ideas.length ? `
<p style="margin:22px 0 8px;font-weight:700;color:#111111">Ideas de regalo${s.presupuesto ? ` de hasta S/ ${s.presupuesto}` : ""}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${ideas.map((x) => `
<tr><td style="padding:6px 0;border-top:1px solid #EEF0F3;font-size:14px"><a href="${esc(x.url)}?${utm}" style="color:#111111;text-decoration:none">${esc(x.name)}</a></td>
<td align="right" style="padding:6px 0;border-top:1px solid #EEF0F3;font-size:14px;white-space:nowrap;color:#5F5F63">desde S/ ${esc(x.priceFrom)}</td></tr>`).join("")}
</table>
<p style="margin:10px 0 0;font-size:12px;color:#8A8A8F">Si eliges su regalo en BoomArt, menciona el código <b>${CODIGO_DESCUENTO}</b> al pedirlo por WhatsApp y obtén 10 % de descuento.</p>` : "";
  const html = plantilla(
    `<p style="margin:0 0 12px">Hola ${esc(pila(p.nombre))},</p>
<p style="margin:0 0 16px">${esc(s.organizador.nombre)} te incluyó en el Amigo Secreto <b>${esc(nombreEvento(s))}</b>.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #FF3030;border-radius:10px"><tr><td align="center" style="padding:18px 12px">
<div style="font-size:13px;color:#5F5F63">Te tocó regalarle a</div>
<div style="font-size:30px;line-height:1.15;font-weight:800;color:#111111;margin-top:4px">${esc(receptor)}</div>
</td></tr></table>
${datos ? `<p style="margin:16px 0 0;font-size:14px">${datos}</p>` : ""}
<p style="margin:14px 0 0;font-size:14px">🤫 Guarda el secreto hasta el día del intercambio.</p>
${ideasHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;background:#F7F7F8;border-radius:8px"><tr><td style="padding:14px 16px;font-size:13px;color:#5F5F63">
¿Quieres recibir ofertas y novedades de BoomArt? <a href="${esc(ofertasUrl)}" style="color:#FF3030;font-weight:700">Sí, quiero recibirlas</a>.<br>
Si no lo tocas, no volveremos a escribirte: tu correo solo se usó para este sorteo.</td></tr></table>
${invitaHtml("¿Tienes otro grupo (familia, oficina, colegio)?")}`,
    `Recibes este correo porque ${esc(s.organizador.nombre)} te incluyó en el Amigo Secreto «${esc(s.evento)}» organizado con la herramienta gratuita de BoomArt. Tus datos se borran después del intercambio.`,
  );
  const ideasTxt = ideas.length ? `\nIdeas de regalo:\n${ideas.map((x) => `- ${x.name} (desde S/ ${x.priceFrom}): ${x.url}`).join("\n")}\nCódigo ${CODIGO_DESCUENTO}: 10 % de descuento pidiendo por WhatsApp.\n` : "";
  const text = `Hola ${pila(p.nombre)}:\n${s.organizador.nombre} te incluyó en el Amigo Secreto «${s.evento}».\nTe tocó regalarle a: ${receptor}\n${s.presupuesto ? `Presupuesto: S/ ${s.presupuesto}\n` : ""}${s.fecha ? `Intercambio: ${fechaLarga(s.fecha)}\n` : ""}${s.nota ? `Nota: ${s.nota}\n` : ""}Guarda el secreto.\n${ideasTxt}\n¿Quieres recibir ofertas de BoomArt? ${ofertasUrl}${invitaTxt("¿Tienes otro grupo?")}`;
  return { to: p.email, subject, html, text };
}

// 3) Al organizador cuando salen los correos. En modo secreto NO incluye las parejas.
export function correoResumen(s: Sorteo, to: number[], fallidos: number[]): Correo {
  const ok = s.participantes.length - fallidos.length;
  const subject = `Listo: enviamos tu Amigo Secreto «${s.evento}»`;
  const fila = (i: number) => s.modo === "admin"
    ? `<tr><td style="padding:6px 0;border-top:1px solid #EEF0F3">${esc(s.participantes[i].nombre)}</td><td style="padding:6px 0;border-top:1px solid #EEF0F3;color:#5F5F63">le regala a</td><td style="padding:6px 0;border-top:1px solid #EEF0F3;font-weight:700">${esc(s.participantes[to[i]].nombre)}</td></tr>`
    : `<tr><td style="padding:6px 0;border-top:1px solid #EEF0F3">${esc(s.participantes[i].nombre)}${fallidos.includes(i) ? ` <span style="color:#FF3030">(no se pudo enviar)</span>` : " ✓"}</td></tr>`;
  const html = plantilla(
    `<p style="margin:0 0 12px">Hola ${esc(pila(s.organizador.nombre))},</p>
<p style="margin:0 0 12px">Enviamos <b>${ok} de ${s.participantes.length}</b> correos del Amigo Secreto <b>${esc(nombreEvento(s))}</b>.</p>
${s.modo === "admin" ? `<p style="margin:0 0 8px">Como administrador, esta es la lista completa. Guárdala por si alguien pierde su correo:</p>` : `<p style="margin:0 0 8px">Nadie, ni siquiera tú, puede ver a quién le tocó cada uno. Recibieron su correo:</p>`}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${s.participantes.map((_, i) => fila(i)).join("")}</table>
${fallidos.length ? `<p style="margin:14px 0 0;color:#FF3030;font-size:13px">No se pudo enviar a: ${fallidos.map((i) => esc(s.participantes[i].nombre)).join(", ")}. Revisa esos correos.</p>` : ""}
<p style="margin:14px 0 0;font-size:13px;color:#5F5F63">Pide a todos que revisen también la carpeta de spam o promociones.</p>
${invitaHtml("¿Te toca organizar otro (la familia, la oficina)?")}`,
    "Recibes este correo porque organizaste un Amigo Secreto con la herramienta gratuita de BoomArt.",
  );
  const text = `Enviamos ${ok} de ${s.participantes.length} correos del Amigo Secreto «${s.evento}».` +
    (s.modo === "admin" ? "\n" + s.participantes.map((p, i) => `${p.nombre} -> ${s.participantes[to[i]].nombre}`).join("\n") : "\nNadie puede ver a quién le tocó cada uno.") + invitaTxt("¿Te toca organizar otro?");
  return { to: s.organizador.email, subject, html, text };
}

// 4) A quien acepta ofertas: confirma la suscripción y deja el enlace de baja.
export function correoSuscripcion(nombre: string, email: string, bajaUrl: string): Correo {
  const subject = "Ya recibirás las ofertas de BoomArt";
  const html = plantilla(
    `<p style="margin:0 0 12px">Hola ${esc(pila(nombre))},</p>
<p style="margin:0 0 12px">¡Gracias! Desde ahora te avisaremos de ofertas y novedades de BoomArt: figuras y decoración impresas en 3D, hechas a pedido en Perú.</p>
<p style="margin:0 0 18px">${boton(SITE + "/?" + "utm_source=amigo-secreto&utm_medium=email&utm_campaign=suscripcion", "Ver la tienda", "#111111")}</p>`,
    `Si no pediste esto o ya no quieres recibir ofertas, <a href="${esc(bajaUrl)}" style="color:#5F5F63">date de baja aquí</a>.`,
  );
  const text = `¡Gracias, ${pila(nombre)}! Recibirás ofertas de BoomArt. Para darte de baja: ${bajaUrl}`;
  return { to: email, subject, html, text };
}
