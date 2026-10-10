/*
 * Redes sociales de BoomArt: FUENTE UNICA.
 *
 * Para cambiar, agregar o quitar una red, se edita SOLO este archivo y se corre
 * `node scripts/build-ai-catalog.mjs`: el generador reescribe el bloque "Siguenos"
 * del pie de pagina (paginas de producto, categoria, Halloween, catalogo) y, entre
 * los marcadores <!-- BOOMART:SOCIAL_FOOTER:START/END --> y
 * <!-- BOOMART:SOCIAL_BAND:START/END -->, el de index.html, nosotros.html y
 * politicas.html.
 */

export const SOCIAL_LINKS = [
  {
    id: "instagram",
    name: "Instagram",
    url: "https://www.instagram.com/boomart_3d/",
    label: "Instagram de BoomArt",
  },
  {
    id: "facebook",
    name: "Facebook",
    url: "https://www.facebook.com/boom.art.873521/",
    label: "Facebook de BoomArt",
  },
  {
    id: "tiktok",
    name: "TikTok",
    url: "https://www.tiktok.com/@boomart.3d",
    label: "TikTok de BoomArt",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    url: "https://wa.me/51925666542?text=Hola%20BoomArt%20%F0%9F%91%8B%20Tengo%20una%20consulta",
    label: "WhatsApp de BoomArt",
  },
];

export const SOCIAL_URLS = Object.fromEntries(SOCIAL_LINKS.map((s) => [s.id, s.url]));

const ICON_ATTRS = 'aria-hidden="true" focusable="false"';
const ICONS = {
  instagram:
    `<svg viewBox="0 0 24 24" ${ICON_ATTRS} fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  facebook:
    `<svg viewBox="0 0 24 24" ${ICON_ATTRS} fill="currentColor"><path d="M13.5 21v-8h2.7l.4-3.2h-3.1V7.9c0-.9.3-1.5 1.6-1.5h1.7V3.5c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.3H7.7V13h2.7v8h3.1z"/></svg>`,
  tiktok:
    `<svg viewBox="0 0 24 24" ${ICON_ATTRS} fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
  whatsapp:
    `<svg viewBox="0 0 32 32" ${ICON_ATTRS} fill="currentColor"><path d="M16.003 3.2C9.05 3.2 3.4 8.85 3.4 15.8c0 2.5.73 4.83 1.99 6.8L3.2 28.8l6.37-2.08a12.5 12.5 0 0 0 6.43 1.76h.01c6.95 0 12.6-5.65 12.6-12.6S22.95 3.2 16 3.2Zm0 22.9h-.01a10.4 10.4 0 0 1-5.29-1.45l-.38-.22-3.78 1.23 1.24-3.68-.25-.39a10.35 10.35 0 0 1-1.6-5.53c0-5.74 4.67-10.4 10.42-10.4 2.78 0 5.39 1.08 7.36 3.05a10.34 10.34 0 0 1 3.05 7.36c0 5.74-4.67 10.4-10.42 10.4Zm5.71-7.79c-.31-.16-1.85-.91-2.14-1.02-.29-.1-.5-.16-.71.16-.21.31-.82 1.02-1 1.24-.19.21-.37.24-.68.08-.31-.16-1.32-.49-2.51-1.55-.93-.83-1.55-1.85-1.74-2.16-.18-.31-.02-.48.14-.63.14-.14.31-.37.47-.55.16-.19.21-.32.31-.53.1-.21.05-.4-.03-.55-.08-.16-.71-1.71-.97-2.34-.26-.62-.52-.53-.71-.54l-.6-.01c-.21 0-.55.08-.84.4-.29.31-1.1 1.08-1.1 2.63s1.13 3.05 1.29 3.26c.16.21 2.22 3.39 5.38 4.75.75.32 1.34.52 1.79.66.75.24 1.44.2 1.98.12.6-.09 1.85-.76 2.11-1.49.26-.73.26-1.36.18-1.49-.08-.13-.29-.21-.6-.37Z"/></svg>`,
};

const linkHtml = (s, pad) =>
  `${pad}<li><a class="social-link" href="${s.url}" target="_blank" rel="noopener noreferrer" aria-label="${s.label} (se abre en otra pestaña)">${ICONS[s.id]}<span>${s.name}</span></a></li>`;

/** Bloque "Siguenos" para el pie de pagina (dentro del primer <div> del .footer). */
export const socialFooterHtml = (indent = "        ") =>
  [
    `${indent}<div class="social-follow">`,
    `${indent}  <p class="social-follow-title">Síguenos</p>`,
    `${indent}  <ul class="social-links">`,
    ...SOCIAL_LINKS.map((s) => linkHtml(s, `${indent}    `)),
    `${indent}  </ul>`,
    `${indent}</div>`,
  ].join("\n");

/** Franja "Siguenos en nuestras redes" de la pagina de inicio (despues de las opiniones). */
export const socialBandHtml = (indent = "      ") =>
  [
    `${indent}<section class="social-section" id="redes" aria-labelledby="socialTitle">`,
    `${indent}  <h2 id="socialTitle">Síguenos en nuestras redes</h2>`,
    `${indent}  <p>Entérate de las piezas nuevas y las novedades de BoomArt, y escríbenos cuando quieras.</p>`,
    `${indent}  <ul class="social-links">`,
    ...SOCIAL_LINKS.map((s) => linkHtml(s, `${indent}    `)),
    `${indent}  </ul>`,
    `${indent}</section>`,
  ].join("\n");
