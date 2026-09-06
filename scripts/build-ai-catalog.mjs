/*
 * Genera versiones "legibles por maquinas" del catalogo a partir de
 * data/products.json (el mismo archivo que edita el panel de administracion).
 *
 * Salidas:
 *   - catalogo.html   Pagina estatica con TODO el catalogo ya renderizado en el
 *                     HTML (sin JavaScript). La leen Google, Bing y las IA
 *                     (Gemini, Meta AI, ChatGPT, Perplexity, Claude...).
 *   - catalogo.json   Feed limpio y normalizado (precios calculados, URLs
 *                     absolutas de imagenes) para consumo programatico.
 *   - llms.txt        Resumen del sitio en el formato estandar llms.txt.
 *   - llms-full.txt   Catalogo completo en Markdown, listo para pegar o para
 *                     que una IA lo descargue de una sola vez.
 *
 * Uso:  node scripts/build-ai-catalog.mjs
 * No necesita dependencias: solo Node.js 18+.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://boomart.pe";
const WHATSAPP = "https://wa.me/51925666542";
const NOW = new Date().toISOString().slice(0, 10);

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const abs = (p) => {
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  return `${SITE}/${String(p).replace(/^\/+/, "")}`;
};

const waLink = (name) =>
  `${WHATSAPP}?text=${encodeURIComponent(`Hola BoomArt, quiero consultar por: ${name}`)}`;

/** Precio "desde" y detalle de precios de un producto, en soles (S/). */
function priceInfo(p) {
  if (p.templePricing) {
    const { temple, pandora, combo } = p.templePricing;
    return {
      // El precio de referencia es el del templo (la pieza principal); el
      // desglose completo va en las lineas de abajo.
      from: typeof temple === "number" ? temple : combo ?? pandora ?? null,
      lines: [
        typeof temple === "number" ? `Templo solo: S/${temple}` : null,
        typeof pandora === "number" ? `Pandora Box + pedestal: S/${pandora}` : null,
        typeof combo === "number" ? `Combo (templo + Pandora Box + pedestal): S/${combo}` : null,
      ].filter(Boolean),
      regular: null,
      offer: typeof combo === "number" ? combo : null,
    };
  }
  const regular = typeof p.regularPrice === "number" ? p.regularPrice : null;
  const offer = typeof p.offerPrice === "number" ? p.offerPrice : null;
  const current = offer ?? regular;
  const lines = [];
  if (offer && regular && offer !== regular) {
    lines.push(`Precio oferta: S/${offer} (antes S/${regular})`);
  } else if (current != null) {
    lines.push(`Precio: S/${current}`);
  }
  return { from: current, lines, regular, offer: current };
}

function loadProducts() {
  return readFile(path.join(ROOT, "data", "products.json"), "utf8").then(JSON.parse);
}

function groupByCategory(products) {
  const map = new Map();
  for (const p of products) {
    const key = p.category || "Otros";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  return [...map.entries()];
}

/* ---------------------------------------------------------------- catalogo.json */
function buildJson(products) {
  const items = products.map((p) => {
    const price = priceInfo(p);
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      tags: p.tags || [],
      description: p.description || "",
      material: p.material || null,
      availability: p.availability || null,
      priceCurrency: "PEN",
      priceFrom: price.from,
      pricing: price.lines,
      image: abs(p.image),
      gallery: (p.gallery || []).map(abs),
      url: `${SITE}/catalogo.html#${p.id}`,
      whatsapp: waLink(p.name),
    };
  });
  return JSON.stringify(
    {
      store: "BoomArt",
      url: `${SITE}/`,
      description:
        "Figuras coleccionables y decoracion impresa en 3D, hechas a pedido en Lima y Callao, Peru. Envios a todo el pais.",
      currency: "PEN",
      updated: NOW,
      contact: { whatsapp: WHATSAPP, instagram: "https://www.instagram.com/boomart_3d" },
      count: items.length,
      products: items,
    },
    null,
    2,
  );
}

/* ---------------------------------------------------------------- JSON-LD */
function buildJsonLd(products) {
  return {
    "@context": "https://schema.org",
    "@type": "OfferCatalog",
    name: "Catalogo BoomArt",
    url: `${SITE}/catalogo.html`,
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => {
      const price = priceInfo(p);
      const product = {
        "@type": "Product",
        position: i + 1,
        name: p.name,
        category: p.category,
        description: p.description || "",
        url: `${SITE}/catalogo.html#${p.id}`,
        image: abs(p.image || (p.gallery && p.gallery[0])),
        brand: { "@type": "Brand", name: "BoomArt" },
      };
      if (p.material) product.material = p.material;
      if (price.from != null) {
        product.offers = {
          "@type": "Offer",
          priceCurrency: "PEN",
          price: price.from,
          availability: "https://schema.org/MadeToOrder",
          url: `${SITE}/catalogo.html#${p.id}`,
        };
      }
      return product;
    }),
  };
}

/* ---------------------------------------------------------------- catalogo.html */
function buildHtml(products) {
  const groups = groupByCategory(products);
  const totalFrom = products
    .map((p) => priceInfo(p).from)
    .filter((v) => typeof v === "number");
  const min = totalFrom.length ? Math.min(...totalFrom) : 0;
  const max = totalFrom.length ? Math.max(...totalFrom) : 0;

  const toc = groups
    .map(([cat, list]) => `<li><a href="#cat-${slug(cat)}">${esc(cat)} (${list.length})</a></li>`)
    .join("\n        ");

  const sections = groups
    .map(([cat, list]) => {
      const cards = list
        .map((p) => {
          const price = priceInfo(p);
          const tags = (p.tags || []).map((t) => `<li>${esc(t)}</li>`).join("");
          const priceLines = price.lines.map((l) => `<li>${esc(l)}</li>`).join("");
          const gallery = (p.gallery && p.gallery.length ? p.gallery : [p.image])
            .filter(Boolean)
            .map(
              (img) =>
                `<img src="${esc(abs(img))}" alt="${esc(p.name)}" width="320" height="320" loading="lazy">`,
            )
            .join("\n          ");
          return `      <article class="ai-product" id="${esc(p.id)}">
        <h3>${esc(p.name)}</h3>
        <p class="ai-cat">Categoria: ${esc(p.category)}</p>
        <p>${esc(p.description)}</p>
        <div class="ai-gallery">
          ${gallery || "<span>Imagen pendiente</span>"}
        </div>
        <ul class="ai-meta">
          ${p.material ? `<li>Material: ${esc(p.material)}</li>` : ""}
          ${p.availability ? `<li>Disponibilidad: ${esc(p.availability)}</li>` : ""}
          ${priceLines}
        </ul>
        ${tags ? `<ul class="ai-tags">${tags}</ul>` : ""}
        <p><a href="${esc(waLink(p.name))}" rel="nofollow">Consultar "${esc(p.name)}" por WhatsApp</a></p>
      </article>`;
        })
        .join("\n");
      return `    <section id="cat-${slug(cat)}">
      <h2>${esc(cat)}</h2>
${cards}
    </section>`;
    })
    .join("\n\n");

  const jsonld = JSON.stringify(buildJsonLd(products));

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Catalogo completo BoomArt | Figuras coleccionables e impresion 3D en Peru</title>
    <meta name="description" content="Catalogo completo de BoomArt: ${products.length} piezas de figuras coleccionables, Saint Seiya, Harry Potter, Marvel, DC, macetas y decoracion impresas en 3D. Precios en soles, hechas a pedido en Lima y Callao con envios a todo el Peru.">
    <link rel="canonical" href="${SITE}/catalogo.html">
    <link rel="icon" type="image/svg+xml" href="assets/boomart-logo.svg">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="BoomArt">
    <meta property="og:title" content="Catalogo completo BoomArt">
    <meta property="og:description" content="Catalogo completo de BoomArt con ${products.length} piezas impresas en 3D. Precios desde S/${min}.">
    <meta property="og:url" content="${SITE}/catalogo.html">
    <meta property="og:image" content="${SITE}/assets/products/promo-12-casas-mini.jpg">
    <meta property="og:locale" content="es_PE">
    <link rel="alternate" type="application/json" href="${SITE}/catalogo.json" title="Feed JSON del catalogo BoomArt">
    <link rel="stylesheet" href="src/styles.css?v=12">
    <style>
      .ai-catalog { max-width: 1040px; margin: 0 auto; padding: 32px 20px 80px; }
      .ai-catalog h1 { margin-bottom: 8px; }
      .ai-catalog .lead { color: #555; max-width: 60ch; }
      .ai-catalog nav ul { columns: 2; gap: 24px; padding-left: 18px; }
      .ai-catalog section { margin-top: 40px; }
      .ai-catalog h2 { border-bottom: 2px solid #eee; padding-bottom: 6px; }
      .ai-product { padding: 18px 0; border-bottom: 1px solid #eee; }
      .ai-product h3 { margin: 0 0 4px; }
      .ai-cat { margin: 0 0 8px; color: #777; font-size: .9rem; }
      .ai-gallery { display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0; }
      .ai-gallery img { width: 160px; height: 160px; object-fit: cover; border-radius: 10px; }
      .ai-meta, .ai-tags { padding-left: 18px; margin: 8px 0; }
      .ai-tags { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
      .ai-tags li { background: #f1f1f1; border-radius: 999px; padding: 2px 10px; font-size: .82rem; }
    </style>
    <script type="application/ld+json">${jsonld}</script>
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="index.html" aria-label="BoomArt inicio">
        <img class="brand-logo" src="assets/boomart-logo.svg" alt="BoomArt">
        <span><strong>BOOM ART</strong><small>Catalogo 3D</small></span>
      </a>
      <nav aria-label="Secciones del sitio">
        <a href="index.html#catalogo">Tienda interactiva</a>
        <a href="nosotros.html">Nosotros</a>
        <a href="${WHATSAPP}" target="_blank" rel="noreferrer">WhatsApp</a>
      </nav>
    </header>

    <main class="ai-catalog">
      <p class="eyebrow">Catalogo BoomArt</p>
      <h1>Catalogo completo BoomArt</h1>
      <p class="lead">
        ${products.length} piezas de figuras coleccionables y decoracion impresas en 3D,
        hechas a pedido en Lima y Callao (Peru), con envios a todo el pais.
        Precios en soles (S/${min}&ndash;S/${max}). Actualizado el ${NOW}.
      </p>
      <p class="lead">
        Esta pagina es la version en texto plano del catalogo, pensada para
        buscadores y asistentes de IA. Para comprar usa la
        <a href="index.html#catalogo">tienda interactiva</a> o escribe por
        <a href="${WHATSAPP}" target="_blank" rel="noreferrer">WhatsApp</a>.
        Feed para desarrolladores: <a href="catalogo.json">catalogo.json</a>.
      </p>

      <nav aria-label="Categorias del catalogo">
        <h2>Categorias</h2>
        <ul>
        ${toc}
        </ul>
      </nav>

${sections}

      <section id="contacto-final">
        <h2>Como comprar</h2>
        <p>
          Todas las piezas se fabrican a pedido en impresion 3D (PLA+/PETG),
          con acabado y detallado a mano. Fabricacion aproximada: 48 horas utiles
          desde la validacion del adelanto (50%). El envio se coordina aparte por
          WhatsApp: a domicilio en Lima y Callao, y por agencia Shalom a provincias.
        </p>
        <p><a href="${WHATSAPP}" target="_blank" rel="noreferrer">Escribir a BoomArt por WhatsApp</a> &middot;
           <a href="https://www.instagram.com/boomart_3d" target="_blank" rel="noreferrer">Instagram @boomart_3d</a></p>
      </section>
    </main>

    <footer class="footer">
      <div>
        <strong>BOOM ART</strong>
        <p>Piezas hechas a pedido. Consulta disponibilidad, colores, acabados y tiempos de entrega por WhatsApp.</p>
        <ul class="footer-links">
          <li><a href="nosotros.html">Nosotros</a></li>
          <li><a href="politicas.html">Politicas de compra, envio y privacidad</a></li>
        </ul>
      </div>
    </footer>
  </body>
</html>
`;
}

function slug(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/* ---------------------------------------------------------------- llms.txt */
function buildLlms(products) {
  const cats = groupByCategory(products)
    .map(([cat, list]) => `- ${cat}: ${list.length} piezas`)
    .join("\n");
  return `# BoomArt

> Figuras coleccionables y decoracion impresa en 3D, hechas a pedido en Lima y Callao (Peru), con envios a todo el pais. Tematicas: Saint Seiya (Caballeros del Zodiaco), Harry Potter, Marvel, DC, mundial de futbol, macetas decorativas y piezas personalizadas. Precios en soles (PEN). Contacto y pedidos por WhatsApp.

## Catalogo

- [Catalogo completo (HTML, texto plano)](${SITE}/catalogo.html): las ${products.length} piezas con descripcion, material y precios.
- [Catalogo en Markdown](${SITE}/llms-full.txt): mismo contenido en un solo archivo de texto.
- [Feed JSON](${SITE}/catalogo.json): datos estructurados (precios, imagenes, categorias).
- [Datos del panel de administracion](${SITE}/data/products.json): fuente original.

## Paginas

- [Inicio / tienda interactiva](${SITE}/): catalogo con carrito y checkout.
- [Nosotros](${SITE}/nosotros.html): quienes somos y como trabajamos.
- [Politicas](${SITE}/politicas.html): compra, envio y privacidad.

## Categorias

${cats}

## Contacto

- WhatsApp: ${WHATSAPP}
- Instagram: https://www.instagram.com/boomart_3d
- Ubicacion: Bellavista, Callao, Peru
- Actualizado: ${NOW}
`;
}

/* ---------------------------------------------------------------- llms-full.txt */
function buildLlmsFull(products) {
  const groups = groupByCategory(products);
  const body = groups
    .map(([cat, list]) => {
      const items = list
        .map((p) => {
          const price = priceInfo(p);
          const priceStr = price.lines.length ? price.lines.join(" | ") : "Precio a consultar";
          const tags = (p.tags || []).join(", ");
          return `### ${p.name}

- Categoria: ${p.category}
- ${priceStr}
- Material: ${p.material || "PLA"}
- Disponibilidad: ${p.availability || "A pedido"}${tags ? `\n- Etiquetas: ${tags}` : ""}
- Imagen: ${abs(p.image || (p.gallery && p.gallery[0]))}
- Ficha: ${SITE}/catalogo.html#${p.id}

${p.description || ""}`;
        })
        .join("\n\n");
      return `## ${cat}\n\n${items}`;
    })
    .join("\n\n");

  return `# Catalogo completo BoomArt

Figuras coleccionables y decoracion impresa en 3D, hechas a pedido en Lima y Callao (Peru).
Envios a todo el pais. Precios en soles peruanos (S/). Fabricacion ~48 horas utiles desde
la validacion del adelanto (50%). Pedidos por WhatsApp: ${WHATSAPP}

Total de piezas: ${products.length}
Actualizado: ${NOW}
Fuente estructurada: ${SITE}/catalogo.json

---

${body}
`;
}

/* ---------------------------------------------------------------- main */
const products = await loadProducts();

await Promise.all([
  writeFile(path.join(ROOT, "catalogo.html"), buildHtml(products)),
  writeFile(path.join(ROOT, "catalogo.json"), buildJson(products) + "\n"),
  writeFile(path.join(ROOT, "llms.txt"), buildLlms(products)),
  writeFile(path.join(ROOT, "llms-full.txt"), buildLlmsFull(products)),
]);

console.log(
  `OK - generado desde ${products.length} productos:\n` +
    "  catalogo.html\n  catalogo.json\n  llms.txt\n  llms-full.txt",
);
