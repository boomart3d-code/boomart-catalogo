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

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SOCIAL_URLS, socialBandHtml, socialFooterHtml } from "./social-links.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://boomart.pe";

// Miniaturas livianas para compartir (WhatsApp no muestra og:image pesadas).
// Las genera .github/scripts/build-og-images.mjs en assets/og/ antes de este
// script; si falta la de un producto, se usa su primera foto como antes.
let OG_MANIFEST = {};
try {
  OG_MANIFEST = JSON.parse(await readFile(path.join(ROOT, "assets", "og", "manifest.json"), "utf8"));
} catch {
  OG_MANIFEST = {};
}
const WHATSAPP = "https://wa.me/51925666542";
const NOW = new Date().toISOString().slice(0, 10);
// Vigencia de precios para el structured data (rueda ~120 dias hacia adelante).
const PRICE_VALID_UNTIL = new Date(Date.now() + 120 * 864e5)
  .toISOString()
  .slice(0, 10);

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

// Los <img> que se VEN en pantalla (galerias, miniaturas, tarjetas) piden el
// .webp generado por scripts/optimize-images.mjs -- mas liviano. El .jpg
// original NO se toca: sigue siendo el que usan og:image/twitter:image y el
// array "image" del JSON-LD de cada producto (WhatsApp/Facebook no leen bien
// .webp en la vista previa de un link). No confundir ambos usos.
const toWebp = (p) => String(p || "").replace(/(assets\/products\/[^/?"]+)\.(jpe?g|png)/i, "$1.webp");

const waLink = (name) =>
  `${WHATSAPP}?text=${encodeURIComponent(`Hola BoomArt, quiero consultar por: ${name}`)}`;

/**
 * Precios de un producto, en soles (PEN). Devuelve:
 *   from       precio de referencia ("desde")
 *   lines      desglose legible para humanos
 *   listPrice  único precio oficial para los feeds (Google/Meta/Pinterest)
 */
function priceInfo(p) {
  if (p.signPicker) {
    const { unitPrice, setPrice } = p.signPicker;
    return {
      from: unitPrice,
      lines: [`Por signo: S/${unitPrice}`, `Set completo (12 signos): S/${setPrice}`],
      listPrice: unitPrice,
    };
  }
  if (p.templePricing) {
    const { temple, pandora, combo } = p.templePricing;
    // El templo suelto es la unidad vendible de referencia (evita que el feed
    // marque "precio no coincide" contra la ficha, que muestra las 3 opciones).
    const base = typeof temple === "number" ? temple : combo ?? pandora ?? null;
    return {
      from: base,
      lines: [
        typeof temple === "number" ? `Templo solo: S/${temple}` : null,
        typeof pandora === "number" ? `Pandora Box + pedestal: S/${pandora}` : null,
        typeof combo === "number" ? `Combo (templo + Pandora Box + pedestal): S/${combo}` : null,
      ].filter(Boolean),
      listPrice: base,
    };
  }
  const current = typeof p.regularPrice === "number" ? p.regularPrice : null;
  return {
    from: current,
    lines: current != null ? [`Precio: S/${current}`] : [],
    listPrice: current,
  };
}

const money = (n) => `${Number(n).toFixed(2)} PEN`;

// Taxonomia de Google Shopping por categoria de BoomArt.
const GOOGLE_CATEGORY = {
  "Macetas Decorativas": "Home & Garden > Lawn & Garden > Gardening > Pots & Planters",
};
const GOOGLE_CATEGORY_DEFAULT =
  "Arts & Entertainment > Hobbies & Creative Arts > Collectibles";
const googleCategory = (p) => GOOGLE_CATEGORY[p.category] || GOOGLE_CATEGORY_DEFAULT;

function loadProducts() {
  return readFile(path.join(ROOT, "data", "products.json"), "utf8").then(JSON.parse);
}

// El costo de envio NO se publica: se coordina por WhatsApp y se paga aparte,
// directo al courier, al momento del despacho. No va en la web, ni en el
// structured data, ni en los feeds.

function loadReviews() {
  return readFile(path.join(ROOT, "data", "reviews.json"), "utf8")
    .then(JSON.parse)
    .then((list) =>
      (Array.isArray(list) ? list : []).filter(
        (r) => r && r.approved !== false && r.rating >= 1 && r.rating <= 5,
      ),
    )
    .catch(() => []);
}

// aggregateRating + review[] para la ficha del negocio (schema.org/Store).
// Devuelve null si todavia no hay opiniones aprobadas: en ese caso no se
// inyecta nada y Search Console mantiene el aviso leve, que es lo correcto.
function buildRatingLd(reviews) {
  if (!reviews.length) return null;
  const value =
    Math.round(
      (reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length) * 10,
    ) / 10;
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": `${SITE}/#store`,
    name: "BoomArt",
    url: `${SITE}/`,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: value.toFixed(1),
      reviewCount: String(reviews.length),
      bestRating: "5",
      worstRating: "1",
    },
    review: reviews
      .slice()
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      .slice(0, 20)
      .map((r) => ({
        "@type": "Review",
        reviewRating: {
          "@type": "Rating",
          ratingValue: String(r.rating),
          bestRating: "5",
        },
        author: { "@type": "Person", name: r.name || "Cliente BoomArt" },
        ...(r.date ? { datePublished: r.date } : {}),
        reviewBody: r.text || "",
      })),
  };
}

// Reescribe TODO lo que hay entre "<!-- BOOMART:<marker>:START" y
// "<!-- BOOMART:<marker>:END -->" de un archivo (markers puestos a mano en el
// HTML fuente). Usado para el <script> de aggregateRating y para el resumen +
// lista de opiniones pre-renderizados (ver mas abajo). Devuelve false si el
// archivo no tiene esos markers o si el contenido no cambio.
async function replaceMarkedBlock(file, marker, blockHtml) {
  const html = await readFile(file, "utf8");
  const start = `<!-- BOOMART:${marker}:START`;
  const end = `<!-- BOOMART:${marker}:END -->`;
  const i = html.indexOf(start);
  const j = html.indexOf(end);
  if (i === -1 || j === -1) return false;
  const iEnd = html.indexOf("-->", i) + 3;
  const next = html.slice(0, iEnd) + blockHtml + html.slice(j);
  if (next === html) return false;
  await writeFile(file, next);
  return true;
}

async function injectRatingIntoIndex(ratingLd) {
  const block = ratingLd
    ? `\n    <script type="application/ld+json">${JSON.stringify(ratingLd)}</script>\n    `
    : "\n    ";
  return replaceMarkedBlock(path.join(ROOT, "index.html"), "RATING", block);
}

/* ------------------------------------------------- opiniones pre-renderizadas
 * Las mismas opiniones aprobadas que ya alimentan el JSON-LD (arriba) se
 * escriben tambien como HTML de verdad dentro de #reviewsSummary/#reviewsList,
 * replicando exactamente el markup que dibuja src/reviews.js en el navegador
 * (mismas clases CSS). Asi un rastreador que no ejecuta JavaScript (o una IA
 * que solo lee el HTML crudo) ve el texto real de las opiniones, no un
 * contenedor vacio. src/reviews.js sigue corriendo igual para los visitantes
 * reales: sobre-escribe este mismo HTML con el mismo resultado (no hay
 * conflicto, es idempotente).
 */
function starRowHtml(rating) {
  const value = Number(rating) || 0;
  const full = Math.floor(value);
  const half = value - full >= 0.3 && value - full < 0.8;
  let out = "";
  for (let i = 1; i <= 5; i++) {
    const cls = i <= full ? " is-on" : i === full + 1 && half ? " is-half" : "";
    out += `<span class="star${cls}">★</span>`;
  }
  return `<span class="stars" aria-hidden="true">${out}</span>`;
}

function fmtReviewDate(value) {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-PE", { year: "numeric", month: "long" }).format(d);
}

function reviewsSummaryBlock(reviews) {
  if (!reviews.length) return `\n          <div class="reviews-summary" id="reviewsSummary" hidden></div>\n          `;
  const avg = reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length;
  const rounded = Math.round(avg * 10) / 10;
  const inner =
    `<span class="reviews-score">${esc(rounded.toFixed(1).replace(".", ","))}</span>` +
    starRowHtml(avg) +
    `<span class="reviews-count">${reviews.length}${reviews.length === 1 ? " opinion" : " opiniones"}</span>`;
  return `\n          <div class="reviews-summary" id="reviewsSummary">${inner}</div>\n          `;
}

function reviewsListBlock(reviews, { titleHtml = "" } = {}) {
  if (!reviews.length) {
    return `\n        <div class="reviews-list-wrap" id="reviewsListWrap" hidden>\n          ${titleHtml}<ul class="reviews-list" id="reviewsList"></ul>\n        </div>\n        `;
  }
  const sorted = reviews.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const items = sorted
    .map((r) => {
      const meta = [r.city, fmtReviewDate(r.date)].filter(Boolean).join(" · ");
      return (
        `<li class="review-card">` +
        `<div class="review-card-head"><strong>${esc(r.name || "Cliente BoomArt")}</strong>${starRowHtml(r.rating)}</div>` +
        (meta ? `<p class="review-card-meta">${esc(meta)}</p>` : "") +
        `<p class="review-card-text">${esc(r.text || "")}</p>` +
        (r.product ? `<p class="review-card-product">Compró: ${esc(r.product)}</p>` : "") +
        `</li>`
      );
    })
    .join("");
  return `\n        <div class="reviews-list-wrap" id="reviewsListWrap">\n          ${titleHtml}<ul class="reviews-list" id="reviewsList">${items}</ul>\n        </div>\n        `;
}

async function injectReviewsBlocks(reviews) {
  const targets = [
    { file: path.join(ROOT, "index.html"), titleHtml: "" },
    { file: path.join(ROOT, "opinion", "index.html"), titleHtml: '<h3 class="reviews-list-title">Opiniones de otros clientes</h3>\n          ' },
  ];
  let count = 0;
  for (const t of targets) {
    const okSummary = await replaceMarkedBlock(t.file, "REVIEWS_SUMMARY", reviewsSummaryBlock(reviews));
    const okList = await replaceMarkedBlock(t.file, "REVIEWS_LIST", reviewsListBlock(reviews, { titleHtml: t.titleHtml }));
    if (okSummary || okList) count += 1;
  }
  return count;
}

// Un producto puede figurar tambien en otras categorias (campo opcional
// "extraCategories", p. ej. la Tiara de Ikki: Saint Seiya + Halloween).
function groupByCategory(products) {
  const map = new Map();
  for (const p of products) {
    for (const key of [p.category || "Otros", ...(p.extraCategories || [])]) {
      if (!map.has(key)) map.set(key, []);
      if (!map.get(key).includes(p)) map.get(key).push(p);
    }
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
      url: `${SITE}/producto/${p.id}/`,
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
      contact: { whatsapp: WHATSAPP, email: "contacto@boomart.pe", instagram: SOCIAL_URLS.instagram, facebook: SOCIAL_URLS.facebook, tiktok: SOCIAL_URLS.tiktok },
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
        url: `${SITE}/producto/${p.id}/`,
        image: abs(p.image || (p.gallery && p.gallery[0])),
        brand: { "@type": "Brand", name: "BoomArt" },
      };
      if (p.material) product.material = p.material;
      if (price.from != null) {
        product.offers = {
          "@type": "Offer",
          priceCurrency: "PEN",
          price: price.from,
          availability: "https://schema.org/InStock",
          itemCondition: "https://schema.org/NewCondition",
          priceValidUntil: PRICE_VALID_UNTIL,
          url: `${SITE}/producto/${p.id}/`,
          seller: { "@type": "Organization", name: "BoomArt" },
          hasMerchantReturnPolicy: {
            "@type": "MerchantReturnPolicy",
            applicableCountry: "PE",
            returnPolicyCategory:
              "https://schema.org/MerchantReturnNotPermitted",
          },
        };
      }
      return product;
    }),
  };
}

/* ---------------------------------------------------------------- catalogo.html */
function reviewsSectionHtml(reviews) {
  if (!reviews.length) return "";
  const avg = reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length;
  const rounded = (Math.round(avg * 10) / 10).toFixed(1);
  const items = reviews
    .slice()
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .map((r) => {
      const meta = [r.city, r.date].filter(Boolean).join(" · ");
      return `        <li class="ai-review">
          <p class="ai-review-head"><strong>${esc(r.name || "Cliente BoomArt")}</strong> &middot; ${esc(String(r.rating))}/5${meta ? ` &middot; ${esc(meta)}` : ""}</p>
          <p>${esc(r.text || "")}</p>
          ${r.product ? `<p class="ai-review-product">Compró: ${esc(r.product)}</p>` : ""}
        </li>`;
    })
    .join("\n");
  return `    <section id="opiniones">
      <h2>Opiniones de clientes</h2>
      <p>Calificación promedio ${rounded} / 5 sobre ${reviews.length} ${reviews.length === 1 ? "opinión" : "opiniones"} publicadas.
         Todas las opiniones se revisan antes de publicarse; puedes dejar la tuya en
         <a href="${SITE}/opinion/">boomart.pe/opinion</a>.</p>
      <ul class="ai-reviews">
${items}
      </ul>
    </section>

`;
}

function buildHtml(products, ratingLd, reviews) {
  const groups = groupByCategory(products);
  const totalFrom = products
    .map((p) => priceInfo(p).from)
    .filter((v) => typeof v === "number");
  const min = totalFrom.length ? Math.min(...totalFrom) : 0;
  const max = totalFrom.length ? Math.max(...totalFrom) : 0;

  const toc = groups
    .map(
      ([cat, list]) =>
        `<li><a href="${SITE}/categoria/${slug(cat)}/">${esc(cat)}</a> (${list.length}) &middot; <a href="#cat-${slug(cat)}">ver en esta pagina</a></li>`,
    )
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
                `<img src="${esc(toWebp(abs(img)))}" alt="${esc(p.name)}" width="320" height="320" loading="lazy" decoding="async">`,
            )
            .join("\n          ");
          return `      <article class="ai-product" id="${esc(p.id)}">
        <h3><a href="${SITE}/producto/${esc(p.id)}/">${esc(p.name)}</a></h3>
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
        <p><a href="${SITE}/producto/${esc(p.id)}/">Ver ficha de ${esc(p.name)}</a> &middot;
           <a href="${esc(waLink(p.name))}" rel="nofollow">consultar por WhatsApp</a></p>
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
  const ratingScript = ratingLd
    ? `\n    <script type="application/ld+json">${JSON.stringify(ratingLd)}</script>`
    : "";

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Catalogo completo BoomArt | Figuras coleccionables e impresion 3D en Peru</title>
    <meta name="description" content="Catalogo completo de BoomArt: ${products.length} piezas de figuras coleccionables, Saint Seiya, Harry Potter, Marvel, DC, macetas y decoracion impresas en 3D. Precios en soles, hechas a pedido en Lima y Callao con envios a todo el Peru.">
    <link rel="canonical" href="${SITE}/catalogo.html">
    <link rel="icon" type="image/svg+xml" href="assets/boomart-mark.svg?v=7">
    <link rel="alternate icon" type="image/png" sizes="32x32" href="assets/boomart-mark-32.png">
    <link rel="apple-touch-icon" sizes="180x180" href="assets/app-icon-180.png">
    <link rel="manifest" href="site.webmanifest">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="BoomArt">
    <meta property="og:title" content="Catalogo completo BoomArt">
    <meta property="og:description" content="Catalogo completo de BoomArt con ${products.length} piezas impresas en 3D. Precios desde S/${min}.">
    <meta property="og:url" content="${SITE}/catalogo.html">
    <meta property="og:image" content="${SITE}/assets/boomart-og.jpg">
    <meta property="og:image:secure_url" content="${SITE}/assets/boomart-og.jpg">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="1200">
    <meta property="og:image:alt" content="BoomArt - Figuras coleccionables e impresion 3D en Peru">
    <meta property="og:locale" content="es_PE">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="${SITE}/assets/boomart-og.jpg">
    <link rel="alternate" type="application/json" href="${SITE}/catalogo.json" title="Feed JSON del catalogo BoomArt">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="src/styles.css?v=68">
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
      .ai-gallery img { width: 160px; height: 160px; object-fit: contain; background: #f2f0ec; border-radius: 10px; }
      .ai-meta, .ai-tags { padding-left: 18px; margin: 8px 0; }
      .ai-tags { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
      .ai-tags li { background: #f1f1f1; border-radius: 999px; padding: 2px 10px; font-size: .82rem; }
      .ai-reviews { list-style: none; padding: 0; display: grid; gap: 14px; }
      .ai-review { border: 1px solid #eee; border-radius: 10px; padding: 12px 14px; }
      .ai-review-head { margin: 0 0 6px; font-size: .92rem; }
      .ai-review-product { color: #777; font-size: .85rem; margin: 6px 0 0; }
    </style>
    <script type="application/ld+json">${jsonld}</script>${ratingScript}
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

${reviewsSectionHtml(reviews)}      <section id="contacto-final">
        <h2>Como comprar</h2>
        <p>
          Todas las piezas se fabrican a pedido en impresion 3D (PLA+/PETG),
          con acabado y detallado a mano. Fabricacion aproximada: 48 horas utiles
          desde la validacion del adelanto (50%). El envio se coordina aparte por
          WhatsApp: a domicilio en Lima y Callao, y por agencia Shalom a provincias.
        </p>
        <p><a href="${WHATSAPP}" target="_blank" rel="noreferrer">Escribir a BoomArt por WhatsApp</a> &middot;
           <a href="mailto:contacto@boomart.pe">contacto@boomart.pe</a> &middot;
           <a href="${SOCIAL_URLS.instagram}" target="_blank" rel="noreferrer">Instagram @boomart_3d</a> &middot;
           <a href="${SOCIAL_URLS.facebook}" target="_blank" rel="noreferrer">Facebook</a> &middot;
           <a href="${SOCIAL_URLS.tiktok}" target="_blank" rel="noreferrer">TikTok @boomart.3d</a></p>
      </section>
    </main>

    <footer class="footer">
      <div>
        <div class="footer-brand"><img class="ba-mark" src="assets/brand/boomart-icon-asistente.png?v=1" alt=""><strong>BOOM ART</strong></div>
        <p>Piezas hechas a pedido. Consulta disponibilidad, colores, acabados y tiempos de entrega por WhatsApp.</p>
        <p><a href="mailto:contacto@boomart.pe">contacto@boomart.pe</a></p>
${socialFooterHtml()}
        <ul class="footer-links">
          <li><a href="nosotros.html">Nosotros</a></li>
          <li><a href="politicas.html">Politicas de compra, envio y privacidad</a></li>
          <li><a href="libro-de-reclamaciones.html">Libro de Reclamaciones</a></li>
        </ul>
      </div>
    </footer>
    <script src="src/track.js?v=5" defer></script>
    <script src="src/shopping-assistant.js?v=9" defer></script>
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
function reviewsSummaryMarkdown(reviews) {
  if (!reviews.length) return "";
  const avg = reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length;
  const rounded = (Math.round(avg * 10) / 10).toFixed(1);
  const top = reviews
    .slice()
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 5)
    .map((r) => `  - "${String(r.text || "").replace(/"/g, "'")}" — ${r.name || "Cliente BoomArt"}${r.date ? `, ${r.date}` : ""}`)
    .join("\n");
  return `## Opiniones de clientes

- Calificacion promedio: ${rounded} / 5 sobre ${reviews.length} ${reviews.length === 1 ? "opinion" : "opiniones"} publicadas (revisadas antes de publicarse).
- Ver todas: ${SITE}/opinion/
- Ejemplos recientes:
${top}

`;
}

function buildLlms(products, reviews = []) {
  const cats = groupByCategory(products)
    .map(([cat, list]) => `- ${cat}: ${list.length} piezas`)
    .join("\n");
  return `# BoomArt

> Figuras coleccionables y decoracion impresa en 3D, hechas a pedido en Lima y Callao (Peru), con envios a todo el pais. Tematicas: Saint Seiya (Caballeros del Zodiaco), Harry Potter, Marvel, DC, mundial de futbol, macetas decorativas y piezas personalizadas. Precios en soles (PEN). Contacto y pedidos por WhatsApp.

## Catalogo

- [Catalogo completo (HTML, texto plano)](${SITE}/catalogo.html): las ${products.length} piezas con descripcion, material y precios.
- [Catalogo en Markdown](${SITE}/llms-full.txt): mismo contenido en un solo archivo de texto.
- [Feed JSON](${SITE}/catalogo.json): datos estructurados (precios, imagenes, categorias).
- [Feed Google/Pinterest (XML)](${SITE}/feed-google.xml): formato Google Merchant Center.
- [Feed Meta (CSV)](${SITE}/feed-meta.csv): catalogo para Instagram y Facebook.
- [Datos del panel de administracion](${SITE}/data/products.json): fuente original.

## Paginas

- [Inicio / tienda interactiva](${SITE}/): catalogo con carrito y checkout.
- [Impresion 3D personalizada](${SITE}/impresion-3d-personalizada/): encargos de personajes, esculturas, regalos y piezas decorativas a partir de una idea o referencias.
- [Merchandising corporativo personalizado](${SITE}/merchandising-corporativo/): figuras, trofeos, miniaturas y piezas especiales para empresas, agencias, campañas y regalos a colaboradores.
- [Cascos, mascaras y cosplay](${SITE}/cosplay/): accesorios impresos en 3D para disfraces, eventos, sesiones de fotos y exhibicion.
- [Saint Seiya](${SITE}/categoria/saint-seiya/): templos del Zodiaco, Cajas de Pandora, altares, dioramas, cascos y colecciones.
- [Halloween](${SITE}/Halloween/): mascaras, cascos y decoracion tematica.
- [Nosotros](${SITE}/nosotros.html): quienes somos y como trabajamos.
- [Politicas](${SITE}/politicas.html): compra, envio y privacidad.

## Categorias

${cats}

${reviewsSummaryMarkdown(reviews)}## Contacto

- WhatsApp: ${WHATSAPP}
- Correo: contacto@boomart.pe
- Instagram: ${SOCIAL_URLS.instagram}
- Facebook: ${SOCIAL_URLS.facebook}
- TikTok: ${SOCIAL_URLS.tiktok}
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
- Ficha: ${SITE}/producto/${p.id}/

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

/* ---------------------------------------------------------------- feed-google.xml
 * Formato Google Merchant Center (RSS 2.0 + namespace g:).
 * Sirve tal cual para Google Shopping / listados gratuitos Y para Pinterest,
 * que acepta el formato de Google como fuente de datos.
 */
function buildGoogleFeed(products) {
  const items = products
    .map((p) => {
      const price = priceInfo(p);
      const gallery = (p.gallery || []).filter(Boolean).map(abs);
      const main = abs(p.image) || gallery[0];
      const extra = gallery
        .filter((g) => g !== main)
        .slice(0, 10)
        .map((g) => `      <g:additional_image_link>${esc(g)}</g:additional_image_link>`)
        .join("\n");
      const desc = `${p.description || p.name} Fabricado a pedido en impresion 3D (${p.material || "PLA"}), acabado y detallado a mano. Produccion ~48 h utiles. Envios a todo el Peru.`;
      return `    <item>
      <g:id>${esc(p.id)}</g:id>
      <g:title>${esc(p.name)}</g:title>
      <g:description>${esc(desc)}</g:description>
      <g:link>${SITE}/producto/${esc(p.id)}/</g:link>
      <g:image_link>${esc(main)}</g:image_link>
${extra ? extra + "\n" : ""}      <g:availability>in_stock</g:availability>
      <g:price>${money(price.listPrice)}</g:price>
      <g:condition>new</g:condition>
      <g:brand>BoomArt</g:brand>
      <g:identifier_exists>no</g:identifier_exists>
      <g:google_product_category>${esc(googleCategory(p))}</g:google_product_category>
      <g:product_type>${esc(p.category)}</g:product_type>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>BoomArt - Catalogo de productos</title>
    <link>${SITE}/</link>
    <description>Figuras coleccionables y decoracion impresa en 3D, hechas a pedido en Peru. Actualizado ${NOW}.</description>
${items}
  </channel>
</rss>
`;
}

/* ---------------------------------------------------------------- feed-meta.csv
 * Catalogo de Meta (Instagram / Facebook Shops). CSV con cabeceras estandar.
 */
function buildMetaFeed(products) {
  const cols = [
    "id",
    "title",
    "description",
    "availability",
    "condition",
    "price",
    "link",
    "image_link",
    "additional_image_link",
    "brand",
    "google_product_category",
    "product_type",
  ];
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""').replace(/\s+/g, " ").trim()}"`;
  const rows = products.map((p) => {
    const price = priceInfo(p);
    const gallery = (p.gallery || []).filter(Boolean).map(abs);
    const main = abs(p.image) || gallery[0];
    const extra = gallery.filter((g) => g !== main).slice(0, 20).join(",");
    const desc = `${p.description || p.name} Fabricado a pedido en impresion 3D (${p.material || "PLA"}). Produccion ~48 h utiles. Envios a todo el Peru.`;
    return [
      p.id,
      p.name,
      desc,
      "in stock",
      "new",
      money(price.listPrice),
      `${SITE}/producto/${p.id}/`,
      main,
      extra,
      "BoomArt",
      googleCategory(p),
      p.category,
    ]
      .map(cell)
      .join(",");
  });
  return [cols.join(","), ...rows].join("\n") + "\n";
}

/* ---------------------------------------------------------------- paginas de producto
 * Una pagina estatica e indexable por producto en /producto/<id>/.
 * Google rankea paginas: la tienda (SPA) y catalogo.html no dan una URL propia
 * por pieza. Estas paginas son aditivas -- no tocan la tienda ni el checkout.
 */

// Contexto por categoria para dar contenido unico (no solo la descripcion corta).
const CAT_CONTEXT = {
  "Saint Seiya":
    "pieza decorativa para coleccionistas de Saint Seiya (Caballeros del Zodiaco)",
  "Harry Potter": "pieza decorativa para fans de Harry Potter y el mundo mágico",
  "Marvel & DC": "figura de colección del universo Marvel y DC",
  "Series y Peliculas": "figura de colección de cine y series",
  "Series y Películas": "figura de colección de cine y series",
  Macetas: "maceta decorativa impresa en 3D",
  "Soportes de Mandos": "soporte de mando para tu setup gamer",
  "Figuras Coleccionables": "figura coleccionable decorativa impresa en 3D",
  "Mundial de Futbol": "pieza de colección para fanáticos del fútbol",
  "Mundial de Fútbol": "pieza de colección para fanáticos del fútbol",
};
// Avisos fijos por categoria (igual que CATEGORY_NOTICES en src/app.js).
const CATEGORY_NOTICES = { "Soportes de Mandos": "No incluye el mando: solo se vende el soporte." };
const productNotice = (p) => p.notice || CATEGORY_NOTICES[p.category] || "";
// Nombre visible de una categoria (igual que CATEGORY_LABELS en src/app.js).
const CATEGORY_LABELS = { "🎃 Halloween": "🎃 Halloween y Cosplay" };
const categoryLabel = (c) => CATEGORY_LABELS[c] || c;
const catContext = (p) =>
  CAT_CONTEXT[p.category] || "figura de colección impresa en 3D";

const stripEmoji = (s) =>
  String(s ?? "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️‍]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

function pageTitle(p) {
  const cat = stripEmoji(categoryLabel(p.category));
  const hasCat = p.name.toLowerCase().includes(cat.toLowerCase());
  const tail = hasCat ? "impresión 3D en Perú" : `${cat} · impresión 3D`;
  return `${p.name} · ${tail} | BoomArt`;
}

function clampWords(str, max) {
  const s = String(str).replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:!¡¿?-]+$/, "") + "...";
}

function pageDescription(p) {
  const price = priceInfo(p);
  const from = price.from != null ? ` Desde S/${price.from}.` : "";
  const short = clampWords(p.description || p.name, 120);
  return `${short}${from} Impresa en 3D a pedido en Lima y Callao, con envíos a todo el Perú. Cómprala por WhatsApp o en la tienda BoomArt.`;
}

function offerLd(p) {
  const common = {
    priceCurrency: "PEN",
    availability: "https://schema.org/InStock",
    itemCondition: "https://schema.org/NewCondition",
    priceValidUntil: PRICE_VALID_UNTIL,
    url: `${SITE}/producto/${p.id}/`,
    seller: { "@type": "Organization", name: "BoomArt" },
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "PE",
      returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
    },
  };
  if (p.signPicker) {
    return {
      "@type": "AggregateOffer",
      offerCount: 13,
      lowPrice: p.signPicker.unitPrice,
      highPrice: p.signPicker.setPrice,
      ...common,
    };
  }
  if (p.templePricing) {
    const vals = [p.templePricing.temple, p.templePricing.pandora, p.templePricing.combo].filter(
      (n) => typeof n === "number",
    );
    return {
      "@type": "AggregateOffer",
      offerCount: vals.length,
      lowPrice: Math.min(...vals),
      highPrice: Math.max(...vals),
      ...common,
    };
  }
  const price = priceInfo(p).from;
  return { "@type": "Offer", price: price != null ? price : 0, ...common };
}

function productLd(p) {
  const imgs = (p.gallery && p.gallery.length ? p.gallery : [p.image])
    .filter(Boolean)
    .map(abs);
  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: String(p.description || p.name).replace(/\s+/g, " ").trim(),
    image: imgs,
    sku: p.id,
    category: stripEmoji(categoryLabel(p.category)),
    brand: { "@type": "Brand", name: "BoomArt" },
    offers: offerLd(p),
  };
  if (p.material) ld.material = p.material;
  // Video corto del producto (campo opcional "video"): Google puede mostrarlo
  // en sus resultados de video.
  if (p.video && p.video.src) {
    ld.subjectOf = {
      "@type": "VideoObject",
      name: `${p.name} en video`,
      description: `Video de ${p.name}, fabricado a pedido por BoomArt en Perú.`,
      thumbnailUrl: abs(p.video.poster || imgs[0]),
      contentUrl: abs(p.video.src),
      uploadDate: p.video.uploadDate || "2026-10-15",
    };
  }
  return ld;
}

function breadcrumbLd(p) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: `${SITE}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: stripEmoji(categoryLabel(p.category)),
        item: `${SITE}/categoria/${slug(p.category)}/`,
      },
      { "@type": "ListItem", position: 3, name: p.name, item: `${SITE}/producto/${p.id}/` },
    ],
  };
}

const PRODUCT_PAGE_CSS = `
    .pp{max-width:1080px;margin:0 auto;padding:clamp(18px,4vw,36px) clamp(16px,4vw,40px) clamp(56px,8vw,88px)}
    .pp-crumbs{font-size:.82rem;color:var(--muted);margin:0 0 18px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    .pp-crumbs a{text-decoration:none;color:inherit}
    .pp-crumbs a:hover{text-decoration:underline}
    .pp-top{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:clamp(20px,4vw,48px);align-items:start}
    .pp-main-img{width:100%;height:auto;aspect-ratio:4/5;max-height:80vh;object-fit:contain;border-radius:14px;border:1px solid var(--line);background:#101010;display:block}
    .pp-thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    .pp-thumbs button{padding:0;border:1px solid var(--line);border-radius:8px;background:#101010;cursor:pointer;width:62px;height:62px;overflow:hidden}
    .pp-thumbs button[aria-current="true"]{border-color:var(--red);border-width:2px}
    .pp-thumbs img{width:100%;height:100%;object-fit:contain;display:block}
    .pp-thumbs .pp-thumb-video{position:relative}
    .pp-thumbs .pp-thumb-video span{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.35);color:#fff;font-size:1rem;pointer-events:none}
    .pp-main-img[hidden]{display:none}
    .pp-info h1{margin:2px 0 4px;font-size:clamp(1.55rem,4vw,2.35rem);line-height:1.1}
    .pp-sub{color:var(--muted);margin:0 0 16px}
    .pp-rating{font-size:.9rem;margin:0 0 16px}
    .pp-rating a{text-decoration:none;font-weight:700}
    .pp-price{border:1px solid var(--line);border-radius:12px;padding:15px 16px;margin:0 0 16px}
    .pp-price .now{font-size:1.45rem;font-weight:800}
    .pp-price .was{color:var(--muted);text-decoration:line-through;margin-left:8px;font-weight:600}
    .pp-price ul{margin:8px 0 0;padding-left:18px}
    .pp-price li{margin:3px 0}
    .pp-cta{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 6px;align-items:center}
    .pp-facts{font-size:.88rem;font-weight:600;line-height:1.45;color:var(--muted);margin:0 0 14px}
    .pp-notice{margin:0 0 14px;padding:10px 12px;border:1px solid rgba(214,173,98,.55);border-left:4px solid #d6ad62;border-radius:8px;background:rgba(214,173,98,.10);font-weight:750;line-height:1.4}
    .pp-body{margin-top:34px;max-width:70ch;line-height:1.65}
    .pp-body h2{font-size:1.15rem;margin:22px 0 8px}
    .pp-body p{margin:0 0 12px}
    .pp-related{margin-top:44px}
    .pp-related h2{font-size:1.15rem;margin:0 0 14px}
    .pp-rel-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
    .pp-rel-grid a{text-decoration:none;color:inherit;border:1px solid var(--line);border-radius:10px;overflow:hidden;display:block}
    .pp-rel-grid img{width:100%;height:auto;aspect-ratio:4/5;object-fit:contain;background:#101010;display:block}
    .pp-rel-grid span{display:block;padding:8px 10px;font-size:.85rem;font-weight:600}
    @media(max-width:760px){
      .pp{padding:12px 14px 44px}
      .pp-crumbs{margin-bottom:12px}
      .pp-top{grid-template-columns:1fr;gap:14px}
      .pp-main-img{border-radius:10px}
      .pp-thumbs{flex-wrap:nowrap;gap:6px;margin-top:8px;overflow-x:auto}
      .pp-thumbs button{width:52px;height:52px;flex:0 0 52px}
      .pp-info h1{font-size:1.55rem}
      .pp-sub{line-height:1.5;margin-bottom:10px}
      .pp-facts{font-size:.82rem;margin-bottom:10px}
      .pp-rating{margin-bottom:10px}
      .pp-price{padding:12px 14px;margin-bottom:12px}
      .pp-cta{gap:8px}
      .pp-cta .button{width:100%;justify-content:center;text-align:center}
      .pp-body{margin-top:24px;line-height:1.55}
    }
`;

function priceBlockHtml(p) {
  const price = priceInfo(p);
  if (p.signPicker) {
    const { unitPrice, setPrice } = p.signPicker;
    return `<div class="pp-price"><span class="now">desde S/${unitPrice}</span><ul><li>Por signo: <strong>S/${unitPrice}</strong> c/u</li><li>Set completo (12 signos): <strong>S/${setPrice}</strong></li></ul></div>`;
  }
  if (p.templePricing) {
    const t = p.templePricing;
    const vals = [t.temple, t.pandora, t.combo].filter((n) => typeof n === "number");
    const rows = [
      typeof t.temple === "number" ? `<li>Templo solo: <strong>S/${t.temple}</strong></li>` : "",
      typeof t.pandora === "number"
        ? `<li>Caja de Pandora + pedestal: <strong>S/${t.pandora}</strong></li>`
        : "",
      typeof t.combo === "number"
        ? `<li>Combo completo (templo + Caja de Pandora + pedestal): <strong>S/${t.combo}</strong></li>`
        : "",
    ].join("");
    return `<div class="pp-price"><span class="now">desde S/${Math.min(...vals)}</span><ul>${rows}</ul></div>`;
  }
  const now = price.from;
  if (now == null) return `<div class="pp-price"><span class="now">Precio a consultar</span></div>`;
  return `<div class="pp-price"><span class="now">S/${now}</span></div>`;
}

function buildProductPage(p, all, ratingLd) {
  const imgs = (p.gallery && p.gallery.length ? p.gallery : [p.image]).filter(Boolean);
  const og = OG_MANIFEST[p.id] && OG_MANIFEST[p.id].source === imgs[0] ? OG_MANIFEST[p.id] : null;
  const ogImg = og ? `${SITE}/assets/og/${p.id}.jpg?v=${og.hash.slice(0, 8)}` : abs(imgs[0]);
  const ogMeta = og
    ? `
    <meta property="og:image:secure_url" content="${esc(ogImg)}">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="${og.width}">
    <meta property="og:image:height" content="${og.height}">
    <meta property="og:image:alt" content="${esc(p.name)}">`
    : "";
  const rel = "../../";
  const url = `${SITE}/producto/${p.id}/`;
  const title = pageTitle(p);
  const desc = pageDescription(p);
  const price = priceInfo(p);
  const wa = waLink(p.name);
  const shop = `${rel}index.html?producto=${encodeURIComponent(p.id)}`;
  const catClean = stripEmoji(categoryLabel(p.category));
  const ctx = catContext(p);

  const mainImgRel = `${rel}${String(imgs[0]).replace(/^\/+/, "")}`;
  const thumbs = imgs
    .map(
      (img, i) =>
        `<button type="button" data-src="${esc(toWebp(`${rel}${String(img).replace(/^\/+/, "")}`))}" aria-current="${i === 0}"><img src="${esc(toWebp(`${rel}${String(img).replace(/^\/+/, "")}`))}" alt="${esc(p.name)} - vista ${i + 1}" loading="lazy" decoding="async" width="62" height="62"></button>`,
    )
    .join("\n            ");
  // Video corto (opcional): miniatura con ▶ en segundo lugar; se carga al elegirla.
  const videoThumb = p.video && p.video.src
    ? `<button type="button" class="pp-thumb-video" data-video="${esc(`${rel}${p.video.src}`)}" aria-current="false" aria-label="Ver video de ${esc(p.name)}"><img src="${esc(`${rel}${p.video.poster || ""}`)}" alt="" loading="lazy" decoding="async" width="62" height="62"><span aria-hidden="true">▶</span></button>`
    : "";
  const thumbsHtml = videoThumb
    ? thumbs.replace("</button>", `</button>\n            ${videoThumb}`)
    : thumbs;

  let related = all.filter((x) => x.category === p.category && x.id !== p.id);
  if (related.length < 4) {
    related = related.concat(
      all.filter((x) => x.id !== p.id && x.category !== p.category && x.featured).slice(0, 4 - related.length),
    );
  }
  related = related.slice(0, 4);
  const relGrid = related
    .map(
      (r) =>
        `<a href="../${esc(r.id)}/"><img src="${esc(toWebp(`${rel}${String((r.gallery && r.gallery[0]) || r.image).replace(/^\/+/, "")}`))}" alt="${esc(r.name)}" loading="lazy" decoding="async" width="180" height="180"><span>${esc(r.name)}</span></a>`,
    )
    .join("\n          ");

  const ratingStr = ratingLd && ratingLd.aggregateRating
    ? `<p class="pp-rating">&#9733; ${ratingLd.aggregateRating.ratingValue} / 5 &middot; <a href="${rel}opinion/">${ratingLd.aggregateRating.reviewCount} opiniones de clientes</a></p>`
    : "";

  const priceMeta =
    price.from != null
      ? `\n    <meta property="product:price:amount" content="${price.from}">\n    <meta property="product:price:currency" content="PEN">`
      : "";

  return `<!doctype html>
<html lang="es">
  <head>
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-HM5C8Q1394"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-HM5C8Q1394');
    </script>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}">
    <link rel="canonical" href="${url}">
    <link rel="icon" type="image/svg+xml" href="${rel}assets/boomart-mark.svg?v=7">
    <link rel="alternate icon" type="image/png" sizes="32x32" href="${rel}assets/boomart-mark-32.png">
    <link rel="apple-touch-icon" sizes="180x180" href="${rel}assets/app-icon-180.png">
    <link rel="manifest" href="${rel}site.webmanifest">
    <meta property="og:type" content="product">
    <meta property="og:site_name" content="BoomArt">
    <meta property="og:title" content="${esc(p.name)} | BoomArt">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${esc(ogImg)}">${ogMeta}
    <meta property="og:locale" content="es_PE">${priceMeta}
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(p.name)} | BoomArt">
    <meta name="twitter:description" content="${esc(desc)}">
    <meta name="twitter:image" content="${esc(ogImg)}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="${rel}src/styles.css?v=68">
    <style>${PRODUCT_PAGE_CSS}</style>
    <script type="application/ld+json">${JSON.stringify(productLd(p))}</script>
    <script type="application/ld+json">${JSON.stringify(breadcrumbLd(p))}</script>
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="${rel}index.html" aria-label="BoomArt inicio">
        <img class="brand-logo" src="${rel}assets/boomart-logo.svg" alt="BoomArt">
        <span><strong>BOOM ART</strong><small>Figuras coleccionables e impresión 3D en Perú</small></span>
      </a>
      <nav aria-label="Secciones del sitio">
        <a href="${rel}index.html#catalogo">Catálogo</a>
        <a href="${rel}nosotros.html">Nosotros</a>
        <a href="${esc(wa)}" target="_blank" rel="noreferrer">WhatsApp</a>
      </nav>
    </header>

    <main class="pp">
      <nav class="pp-crumbs" aria-label="Ruta de navegación">
        <a href="${rel}index.html">Inicio</a> <span aria-hidden="true">&rsaquo;</span>
        <a href="${rel}categoria/${slug(p.category)}/">${esc(catClean)}</a> <span aria-hidden="true">&rsaquo;</span>
        <span>${esc(p.name)}</span>
      </nav>

      <div class="pp-top">
        <div class="pp-media">
          <img class="pp-main-img" id="ppMain" src="${esc(toWebp(mainImgRel))}" alt="${esc(p.name)} · figura impresa en 3D por BoomArt" width="640" height="640" decoding="async">
          ${videoThumb ? `<video class="pp-main-img" id="ppVideo" muted loop playsinline preload="none" hidden aria-label="Video de ${esc(p.name)}"></video>` : ""}
          ${imgs.length > 1 || videoThumb ? `<div class="pp-thumbs" id="ppThumbs">\n            ${thumbsHtml}\n          </div>` : ""}
        </div>
        <div class="pp-info">
          <p class="eyebrow">${esc(catClean)}</p>
          <h1>${esc(p.name)}</h1>
          <p class="pp-sub">${esc(String(p.description || `${p.name}: ${ctx}.`).replace(/\s+/g, " ").trim())}</p>
          <p class="pp-facts">${[
            p.height ? `Tamaño: ${esc(p.height)}` : "",
            p.material ? `Material: ${esc(p.material)}` : "",
          ].filter(Boolean).join(" &middot; ")}</p>
          ${productNotice(p) ? `<p class="pp-notice">⚠️ ${esc(productNotice(p))}</p>` : ""}
          ${ratingStr}
          ${priceBlockHtml(p)}
          <div class="pp-cta">
            <a class="button primary" href="${esc(shop)}">Ver en la tienda y agregar al carrito</a>
            <a class="button secondary" href="${esc(wa)}" target="_blank" rel="noreferrer nofollow">Consultar por WhatsApp</a>
            <button type="button" class="button ghost" id="ppShare" data-url="${esc(url)}?src=compartir" data-title="${esc(p.name)}" data-id="${esc(p.id)}" style="display:none">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15V3m0 0L8 7m4-4 4 4M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span class="pp-share-label">Compartir</span>
            </button>
            <span class="share-feedback" id="ppShareFeedback" role="status" aria-live="polite" hidden></span>
          </div>
        </div>
      </div>

      <div class="pp-body">
        <h2>Detalle de la pieza</h2>
        <p>${esc(p.name)} es una ${esc(ctx)}, diseñada y fabricada por BoomArt en ${esc(p.height && /cm/i.test(p.height) ? p.height + ", " : "")}Perú. Se imprime en 3D en ${esc(p.material || "PLA+")}, con acabado y pintura a mano según la pieza, así que es un objeto hecho especialmente para tu pedido &mdash; puedes pedir un color, tamaño o detalle distinto y lo coordinamos por WhatsApp.</p>
        ${p.tags && p.tags.length ? `<p>Relacionada con: ${p.tags.map((t) => esc(t)).join(", ")}.</p>` : ""}
        <h2>Producción y tiempos</h2>
        <p>Cada pieza se produce a pedido. La fabricación toma aproximadamente <strong>48 horas útiles</strong> desde que confirmas tu compra. No trabajamos con stock: esto nos permite ajustar cada figura a lo que pides.</p>
        <h2>Envío y entrega</h2>
        <p>Entregamos a domicilio en Lima y Callao coordinando por WhatsApp, y a provincias por la agencia Shalom. El costo del envío se coordina por WhatsApp y se paga aparte, directo al courier, al momento del despacho. <a href="${rel}politicas.html">Ver políticas de compra y envío</a>.</p>
        <h2>Cómo comprar</h2>
        <p><a href="${esc(shop)}">Agrégala al carrito en la tienda BoomArt</a> o <a href="${esc(wa)}" target="_blank" rel="noreferrer nofollow">escríbenos por WhatsApp</a> para consultar disponibilidad y coordinar tu pedido.</p>
      </div>

      ${
        related.length
          ? `<section class="pp-related">
        <h2>También te puede interesar</h2>
        <div class="pp-rel-grid">
          ${relGrid}
        </div>
      </section>`
          : ""
      }
    </main>

    <footer class="footer">
      <div>
        <div class="footer-brand"><img class="ba-mark" src="${rel}assets/brand/boomart-icon-asistente.png?v=1" alt=""><strong>BOOM ART</strong></div>
        <p>Piezas hechas a pedido. Consulta disponibilidad, colores, acabados y tiempos de entrega por WhatsApp.</p>
        <p><a href="mailto:contacto@boomart.pe">contacto@boomart.pe</a></p>
${socialFooterHtml()}
        <ul class="footer-links">
          <li><a href="${rel}catalogo.html">Catálogo completo</a></li>
          <li><a href="${rel}nosotros.html">Nosotros</a></li>
          <li><a href="${rel}politicas.html">Políticas de compra, envío y privacidad</a></li>
          <li><a href="${rel}libro-de-reclamaciones.html">Libro de Reclamaciones</a></li>
        </ul>
      </div>
      <a class="button secondary" href="${esc(wa)}" target="_blank" rel="noreferrer">Escribir por WhatsApp</a>
    </footer>

    <a class="ba-wa" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="Escríbenos por WhatsApp">
      <span class="ba-wa__label">¿Dudas? Escríbenos</span>
      <span class="ba-wa__icon" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="28" height="28" fill="#fff"><path d="M16.003 3.2C9.05 3.2 3.4 8.85 3.4 15.8c0 2.5.73 4.83 1.99 6.8L3.2 28.8l6.37-2.08a12.5 12.5 0 0 0 6.43 1.76h.01c6.95 0 12.6-5.65 12.6-12.6S22.95 3.2 16 3.2Zm0 22.9h-.01a10.4 10.4 0 0 1-5.29-1.45l-.38-.22-3.78 1.23 1.24-3.68-.25-.39a10.35 10.35 0 0 1-1.6-5.53c0-5.74 4.67-10.4 10.42-10.4 2.78 0 5.39 1.08 7.36 3.05a10.34 10.34 0 0 1 3.05 7.36c0 5.74-4.67 10.4-10.42 10.4Zm5.71-7.79c-.31-.16-1.85-.91-2.14-1.02-.29-.1-.5-.16-.71.16-.21.31-.82 1.02-1 1.24-.19.21-.37.24-.68.08-.31-.16-1.32-.49-2.51-1.55-.93-.83-1.55-1.85-1.74-2.16-.18-.31-.02-.48.14-.63.14-.14.31-.37.47-.55.16-.19.21-.32.31-.53.1-.21.05-.4-.03-.55-.08-.16-.71-1.71-.97-2.34-.26-.62-.52-.53-.71-.54l-.6-.01c-.21 0-.55.08-.84.4-.29.31-1.1 1.08-1.1 2.63s1.13 3.05 1.29 3.26c.16.21 2.22 3.39 5.38 4.75.75.32 1.34.52 1.79.66.75.24 1.44.2 1.98.12.6-.09 1.85-.76 2.11-1.49.26-.73.26-1.36.18-1.49-.08-.13-.29-.21-.6-.37Z"/></svg>
      </span>
    </a>

    <script>
      (function () {
        var btn = document.getElementById("ppShare");
        if (!btn) return;
        var fb = document.getElementById("ppShareFeedback");
        var label = btn.querySelector(".pp-share-label");
        var url = btn.getAttribute("data-url");
        var title = btn.getAttribute("data-title");
        var id = btn.getAttribute("data-id");
        var touch = !!(window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches);
        var useNative = typeof navigator.share === "function" && touch;
        var text = useNative ? "Compartir" : "Copiar enlace";
        if (label) label.textContent = text;
        btn.setAttribute("aria-label", text + " de este producto");
        btn.style.display = "";
        function note(msg, ms) {
          if (!fb) return;
          fb.textContent = msg;
          fb.hidden = false;
          setTimeout(function () { fb.hidden = true; }, ms);
        }
        function track(method) {
          if (window.gtag) gtag("event", "share", { method: method, item_id: id });
          try {
            if (window.BoomartTrack) window.BoomartTrack.event("compartir", { p: id, o: method === "copy" ? "copiar" : "menu" });
          } catch (e) {}
        }
        function fallbackCopy(t) {
          var el = document.createElement("textarea");
          el.value = t;
          el.setAttribute("readonly", "");
          el.style.position = "fixed";
          el.style.top = "0";
          el.style.opacity = "0";
          document.body.appendChild(el);
          el.focus();
          el.select();
          el.setSelectionRange(0, t.length);
          var ok = false;
          try { ok = document.execCommand("copy"); } catch (e) {}
          document.body.removeChild(el);
          btn.focus();
          return ok;
        }
        function copy(t) {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return fallbackCopy(t); });
          }
          return Promise.resolve(fallbackCopy(t));
        }
        function doCopy() {
          copy(url).then(function (ok) {
            if (ok) { track("copy"); note("Enlace copiado ✓", 2600); }
            else { note("No se pudo copiar el enlace", 3200); }
          });
        }
        btn.addEventListener("click", function () {
          if (useNative) {
            navigator.share({ title: title, text: title, url: url }).then(
              function () { track("web_share"); },
              function (err) { if (!err || err.name !== "AbortError") doCopy(); }
            );
          } else {
            doCopy();
          }
        });
      })();
    </script>

    <script>
      (function () {
        var thumbs = document.getElementById("ppThumbs");
        var main = document.getElementById("ppMain");
        var video = document.getElementById("ppVideo");
        if (!thumbs || !main) return;
        thumbs.addEventListener("click", function (e) {
          var btn = e.target.closest("button[data-src], button[data-video]");
          if (!btn) return;
          if (btn.hasAttribute("data-video") && video) {
            if (!video.getAttribute("src")) video.src = btn.getAttribute("data-video");
            main.hidden = true;
            video.hidden = false;
            video.play().catch(function () {});
          } else {
            if (video) { video.pause(); video.hidden = true; }
            main.hidden = false;
            main.src = btn.getAttribute("data-src");
          }
          thumbs.querySelectorAll("button").forEach(function (b) {
            b.setAttribute("aria-current", b === btn);
          });
        });
      })();
    </script>
    <script src="${rel}src/track.js?v=5" defer></script>
    <script src="${rel}src/shopping-assistant.js?v=9" defer></script>
  </body>
</html>
`;
}

async function writeProductPages(products, ratingLd) {
  await Promise.all(
    products.map(async (p) => {
      const dir = path.join(ROOT, "producto", p.id);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "index.html"), buildProductPage(p, products, ratingLd));
    }),
  );
  return products.length;
}

/* ---------------------------------------------------------------- paginas de categoria
 * Una landing por categoria en /categoria/<slug>/ con texto propio + grilla de
 * productos que enlaza a /producto/<id>/. Aditivas; la tienda (SPA) no cambia.
 */
const CATEGORY_META = {
  "Figuras Coleccionables": {
    h1: "Figuras coleccionables impresas en 3D",
    title: "Figuras coleccionables y decorativas impresas en 3D · Perú | BoomArt",
    intro: [
      "Figuras coleccionables y decorativas con personajes de cine, series y videojuegos: el Pato Lucas Kratos (God of War), Mario Billy de Saw y ZKULL Urban, para tu escritorio, repisa o colección.",
      "Hechas a pedido en Lima y Callao, con envíos a todo el Perú. Escríbenos por WhatsApp para consultar.",
    ],
  },
  "Soportes de Mandos": {
    h1: "Soportes de mando gamer impresos en 3D",
    title: "Soportes de mando para PS5, Xbox y más, impresos en 3D · Perú | BoomArt",
    intro: [
      "Soportes de mando universales con diseños de tus personajes favoritos, como el puño de Wolverine con sus garras: sostienen tu control de PlayStation, Xbox u otras consolas y le dan estilo a tu setup gamer.",
      "Fabricados a pedido en PLA+ para mayor resistencia, en Lima y Callao. Envíos a todo el Perú. Escríbenos por WhatsApp para consultar.",
    ],
  },
  "Saint Seiya": {
    h1: "Figuras de Saint Seiya impresas en 3D",
    title: "Figuras de Saint Seiya (Caballeros del Zodiaco) en 3D · Perú | BoomArt",
    intro: [
      "En BoomArt somos referentes en Perú en figuras y réplicas decorativas de Saint Seiya (Caballeros del Zodiaco). Aquí están los 12 templos de las Casas del Zodiaco del Santuario de Athena, las Cajas de Pandora con pedestal, cascos a escala, bustos y esculturas de Atena, dioramas de los caballeros de bronce y sets completos de colección.",
      "Todas las piezas se imprimen en 3D y se detallan a mano, con acabado tipo piedra envejecida que resalta la arquitectura de cada templo. Se fabrican a pedido: eliges el signo y si quieres el templo solo, la Caja de Pandora o el combo completo.",
      "Hechas en Lima y Callao, con envíos a todo el Perú. Escríbenos por WhatsApp para consultar disponibilidad, combos y tiempos de entrega.",
    ],
  },
  "Harry Potter": {
    h1: "Figuras y decoración de Harry Potter en 3D",
    title: "Figuras de Harry Potter impresas en 3D · Perú | BoomArt",
    intro: [
      "Piezas decorativas del mundo mágico de Harry Potter, impresas en 3D y pensadas para fans y coleccionistas: el Castillo de Hogwarts, el ajedrez mágico con las cuatro casas, la lámpara del Sombrero Seleccionador y la lámpara lunar de Hogwarts.",
      "Cada pieza se fabrica a pedido en PLA+ con acabado y pintura a mano. Puedes pedir un color o detalle distinto y lo coordinamos por WhatsApp.",
      "Fabricadas en Perú, con envíos a todo el país.",
    ],
  },
  "Marvel & DC": {
    h1: "Figuras de Marvel y DC impresas en 3D",
    title: "Figuras de Marvel y DC en 3D (Spider-Man, Wolverine, Batwoman) · Perú | BoomArt",
    intro: [
      "Figuras y accesorios de superhéroes de Marvel y DC impresos en 3D: el casco de Wolverine con garras, la máscara de Batwoman y las palomeras de Spider-Man para tu escritorio o tu colección.",
      "Piezas hechas a pedido y detalladas a mano en Lima y Callao. Envíos a todo el Perú. Escríbenos por WhatsApp para consultar.",
    ],
  },
  "🎃 Halloween": {
    h1: "Halloween y Cosplay: máscaras, cascos y disfraces en 3D",
    title: "Halloween y Cosplay: máscaras y cascos para disfraz en 3D · Perú | BoomArt",
    intro: [
      "Colección de temporada de Halloween: máscaras, calaveras y piezas de terror para decorar tu casa o regalar. Incluye la máscara Calabaza Calavera, el candelabro calavera, Evil Mask, la máscara de Krampus, Mario Billy (Saw) y más.",
      "Todas impresas en 3D y pintadas a mano, hechas a pedido. La disponibilidad depende de la temporada: consulta por WhatsApp con tiempo antes de tu evento.",
      "Fabricadas en Perú, con envíos a todo el país.",
    ],
  },
  "Series y Películas": {
    h1: "Figuras de cine y series impresas en 3D",
    title: "Figuras de películas y series en 3D · Perú | BoomArt",
    intro: [
      "Figuras de colección de cine, series y videojuegos impresas en 3D: el Casco de Agamenón inspirado en La Odisea, el Pato Lucas Kratos de God of War y la máscara de El Juego del Calamar.",
      "Piezas hechas a pedido y detalladas a mano en Lima y Callao. ¿Buscas un personaje que no ves aquí? Escríbenos: también hacemos piezas personalizadas.",
    ],
  },
  Macetas: {
    h1: "Macetas decorativas impresas en 3D",
    title: "Macetas decorativas impresas en 3D (Groot, Pikachu, minimalistas) · Perú | BoomArt",
    intro: [
      "Macetas decorativas impresas en 3D para tus suculentas, cactus y plantas pequeñas. Diseños de cultura pop —Groot, Baby Groot, Pikachu, Darth Vader— y también piezas minimalistas y clásicas como la maceta David o la de palmera.",
      "Impresas en PLA a pedido, en el color que elijas. Fabricadas en Perú, con envíos a todo el país. Consulta por WhatsApp.",
    ],
  },
  "Mundial de Fútbol": {
    h1: "Piezas de colección del Mundial de Fútbol en 3D",
    title: "Réplica Copa del Mundo, Balón y Botín de Oro en 3D · Perú | BoomArt",
    intro: [
      "Piezas de colección para fanáticos del fútbol: la réplica premium de la Copa del Mundo a tamaño real 1:1, el Botín de Oro, el Balón de Oro y la caja organizadora para tus figuritas del álbum Panini Mundial 2026.",
      "Impresas en 3D y detalladas a mano, hechas a pedido en Lima y Callao. Envíos a todo el Perú. Escríbenos por WhatsApp.",
    ],
  },
};

// Coleccion transversal para la campana de Halloween. Mantiene la categoria
// principal de cada producto (Marvel, Saint Seiya, etc.) y los reune tambien
// en el enlace corto que se comparte en publicidad y WhatsApp.
const HALLOWEEN_CAMPAIGN_PRODUCT_IDS = [
  // Novedad.
  "mascara-calavera",
  // Marvel y DC.
  "visor-de-cyclops",
  "mascara-red-hood",
  "mascara-dr-doom",
  "casco-de-batman",
  "mascara-de-batwoman",
  "casco-de-wolverine-con-garras",
  // Star Wars.
  "casco-de-stormtrooper",
  "casco-del-mandaloriano",
  // Cine y series.
  "mascara-de-john-wick",
  "mascara-el-juego-del-calamar",
  "mascara-hellboy-articulada",
  "casco-gladiador-maximo",
  "casco-de-agamenon-la-odisea",
  "mario-billy-saw",
  // Mascaras diabolicas y terror.
  "mascarada-del-diablo",
  "evil-mask",
  "mascara-baphomet",
  "mascara-krampus",
  "mascara-calabaza-calavera",
  // Fantasia, elfos y accesorios historicos.
  "corona-de-elfo",
  "cuernos-de-fauno",
  "tiara-de-ikki-de-fenix-saint-seiya",
  "casco-de-pegaso-saint-seiya",
  "tiara-de-pegaso-saint-seiya",
  // Figuras y decoracion; el candelabro cierra la coleccion.
  "zkull-urban",
  "candelabro-calavera",
];

const HALLOWEEN_CAMPAIGN_META = {
  h1: "Halloween en BoomArt: máscaras, cascos y decoración 3D",
  title: "Halloween: máscaras, cascos y decoración 3D · Perú | BoomArt",
  intro: [
    "Prepárate para Halloween con máscaras, cascos, accesorios de cosplay, calaveras y decoración impresos en 3D. Esta selección reúne piezas de terror y accesorios de tus personajes favoritos en un solo lugar.",
    "Todas las piezas se fabrican a pedido y se detallan a mano. Consulta disponibilidad, medidas y tiempos de entrega por WhatsApp antes de tu evento.",
    "Fabricadas en Perú, con envíos a todo el país.",
  ],
};

const CATEGORY_PAGE_CSS = `
    .cat{max-width:1100px;margin:0 auto;padding:clamp(18px,4vw,36px) clamp(16px,4vw,40px) clamp(56px,8vw,88px)}
    .cat-crumbs{font-size:.82rem;color:var(--muted);margin:0 0 16px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    .cat-crumbs a{text-decoration:none;color:inherit}
    .cat-crumbs a:hover{text-decoration:underline}
    .cat h1{margin:2px 0 6px;font-size:clamp(1.7rem,4.4vw,2.6rem);line-height:1.08}
    .cat-lead{color:var(--muted);max-width:70ch;margin:0 0 8px}
    .cat-intro{max-width:70ch;line-height:1.65;margin:16px 0 8px}
    .cat-intro p{margin:0 0 12px}
    .cat-count{font-size:.85rem;color:var(--muted);font-weight:700;margin:20px 0 12px}
    .cat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
    @media(min-width:560px){.cat-grid{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}}
    .cat-card{border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;text-decoration:none;color:inherit;background:rgba(255,255,255,.02)}
    .cat-card img{width:100%;height:auto;aspect-ratio:4/5;object-fit:contain;background:#101010;display:block}
    .cat-card .b{padding:10px 12px;display:flex;flex-direction:column;gap:4px}
    .cat-card .n{font-weight:700;font-size:.92rem;line-height:1.25}
    .cat-card .p{font-size:.9rem;color:var(--muted)}
    .cat-more{margin-top:28px}
`;

function categorySlug(cat) {
  return slug(cat);
}

function buildCategoryPage(cat, list, all, ratingLd, options = {}) {
  const meta = options.meta || CATEGORY_META[cat] || {
    h1: `${stripEmoji(cat)} impresas en 3D`,
    title: `${stripEmoji(cat)} en impresión 3D · Perú | BoomArt`,
    intro: [
      `Figuras y piezas de ${stripEmoji(cat)} impresas en 3D, hechas a pedido en Lima y Callao con envíos a todo el Perú.`,
    ],
  };
  const rel = options.rel || "../../";
  const s = categorySlug(cat);
  const url = options.url || `${SITE}/categoria/${s}/`;
  const clean = options.clean || stripEmoji(categoryLabel(cat));
  const wa = `${WHATSAPP}?text=${encodeURIComponent(`Hola BoomArt, quiero consultar por el catálogo de ${clean}`)}`;
  // Sin imagen propia, la categoría usa la miniatura liviana (assets/og/) de su
  // primer producto: las fotos principales pueden ser PNG de más de 1 MB que
  // WhatsApp no muestra.
  const firstSrc = list[0] && ((list[0].gallery && list[0].gallery[0]) || list[0].image);
  const firstOg = !options.ogImg && list[0] && OG_MANIFEST[list[0].id] && OG_MANIFEST[list[0].id].source === firstSrc
    ? OG_MANIFEST[list[0].id]
    : null;
  const ogImg = options.ogImg
    || (firstOg ? `${SITE}/assets/og/${list[0].id}.jpg?v=${firstOg.hash.slice(0, 8)}` : abs(firstSrc))
    || `${SITE}/assets/boomart-og.jpg`;
  const ogAlt = options.ogAlt || `${meta.h1} | BoomArt`;
  const ogW = options.ogWidth || (firstOg && firstOg.width);
  const ogH = options.ogHeight || (firstOg && firstOg.height);
  const ogSize = ogW && ogH
    ? `\n    <meta property="og:image:width" content="${ogW}">\n    <meta property="og:image:height" content="${ogH}">`
    : "";
  const ogExtra = options.ogImg || firstOg
    ? `\n    <meta property="og:image:secure_url" content="${esc(ogImg)}">\n    <meta property="og:image:type" content="image/jpeg">${ogSize}\n    <meta property="og:image:alt" content="${esc(ogAlt)}">`
    : "";
  const twitterImageAlt = options.ogImg || firstOg
    ? `\n    <meta name="twitter:image:alt" content="${esc(ogAlt)}">`
    : "";
  const desc = clampWords(meta.intro[0], 155);

  const cards = list
    .map((p) => {
      const price = priceInfo(p);
      const pr =
        price.from != null
          ? (p.templePricing || p.signPicker ? `desde S/${price.from}` : `S/${price.from}`)
          : "Consultar";
      const img = `${rel}${String((p.gallery && p.gallery[0]) || p.image).replace(/^\/+/, "")}`;
      return `        <a class="cat-card" href="${rel}producto/${esc(p.id)}/">
          <img src="${esc(toWebp(img))}" alt="${esc(p.name)}" loading="lazy" decoding="async" width="240" height="240">
          <span class="b"><span class="n">${esc(p.name)}</span><span class="p">${esc(pr)}</span></span>
        </a>`;
    })
    .join("\n");

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: meta.h1,
    url,
    numberOfItems: list.length,
    itemListElement: list.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE}/producto/${p.id}/`,
      name: p.name,
    })),
  };
  const crumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: clean, item: url },
    ],
  };
  const catNav = Object.keys(CATEGORY_META)
    .map((c) => `<li><a href="${rel}categoria/${categorySlug(c)}/">${esc(stripEmoji(categoryLabel(c)))}</a></li>`)
    .join("\n          ");

  return `<!doctype html>
<html lang="es">
  <head>
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-HM5C8Q1394"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-HM5C8Q1394');
    </script>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(meta.title)}</title>
    <meta name="description" content="${esc(desc)}">
    <link rel="canonical" href="${url}">
    <link rel="icon" type="image/svg+xml" href="${rel}assets/boomart-mark.svg?v=7">
    <link rel="alternate icon" type="image/png" sizes="32x32" href="${rel}assets/boomart-mark-32.png">
    <link rel="apple-touch-icon" sizes="180x180" href="${rel}assets/app-icon-180.png">
    <link rel="manifest" href="${rel}site.webmanifest">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="BoomArt">
    <meta property="og:title" content="${esc(meta.h1)} | BoomArt">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${esc(ogImg)}">${ogExtra}
    <meta property="og:locale" content="es_PE">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(meta.h1)} | BoomArt">
    <meta name="twitter:description" content="${esc(desc)}">
    <meta name="twitter:image" content="${esc(ogImg)}">${twitterImageAlt}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="${rel}src/styles.css?v=68">
    <style>${CATEGORY_PAGE_CSS}</style>
    <script type="application/ld+json">${JSON.stringify(itemListLd)}</script>
    <script type="application/ld+json">${JSON.stringify(crumbLd)}</script>
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="${rel}index.html" aria-label="BoomArt inicio">
        <img class="brand-logo" src="${rel}assets/boomart-logo.svg" alt="BoomArt">
        <span><strong>BOOM ART</strong><small>Figuras coleccionables e impresión 3D en Perú</small></span>
      </a>
      <nav aria-label="Secciones del sitio">
        <a href="${rel}index.html#catalogo">Catálogo</a>
        <a href="${rel}nosotros.html">Nosotros</a>
        <a href="${esc(wa)}" target="_blank" rel="noreferrer">WhatsApp</a>
      </nav>
    </header>

    <main class="cat">
      <nav class="cat-crumbs" aria-label="Ruta de navegación">
        <a href="${rel}index.html">Inicio</a> <span aria-hidden="true">&rsaquo;</span>
        <span>${esc(clean)}</span>
      </nav>

      <p class="eyebrow">Catálogo BoomArt</p>
      <h1>${esc(meta.h1)}</h1>
      <div class="cat-intro">
        ${meta.intro.map((t) => `<p>${esc(t)}</p>`).join("\n        ")}
      </div>

      <p class="cat-count">${list.length} ${list.length === 1 ? "pieza" : "piezas"} en ${esc(clean)}</p>
      <div class="cat-grid">
${cards}
      </div>

      <p class="cat-more"><a href="${rel}catalogo.html">Ver el catálogo completo</a> &middot; <a href="${esc(wa)}" target="_blank" rel="noreferrer nofollow">Consultar por WhatsApp</a></p>
    </main>

    <footer class="footer">
      <div>
        <div class="footer-brand"><img class="ba-mark" src="${rel}assets/brand/boomart-icon-asistente.png?v=1" alt=""><strong>BOOM ART</strong></div>
        <p>Piezas hechas a pedido. Consulta disponibilidad, colores, acabados y tiempos de entrega por WhatsApp.</p>
        <p><a href="mailto:contacto@boomart.pe">contacto@boomart.pe</a></p>
${socialFooterHtml()}
        <ul class="footer-links">
          ${catNav}
        </ul>
        <ul class="footer-links">
          <li><a href="${rel}catalogo.html">Catálogo completo</a></li>
          <li><a href="${rel}nosotros.html">Nosotros</a></li>
          <li><a href="${rel}politicas.html">Políticas de compra, envío y privacidad</a></li>
          <li><a href="${rel}libro-de-reclamaciones.html">Libro de Reclamaciones</a></li>
        </ul>
      </div>
      <a class="button secondary" href="${esc(wa)}" target="_blank" rel="noreferrer">Escribir por WhatsApp</a>
    </footer>

    <a class="ba-wa" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="Escríbenos por WhatsApp">
      <span class="ba-wa__label">¿Dudas? Escríbenos</span>
      <span class="ba-wa__icon" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="28" height="28" fill="#fff"><path d="M16.003 3.2C9.05 3.2 3.4 8.85 3.4 15.8c0 2.5.73 4.83 1.99 6.8L3.2 28.8l6.37-2.08a12.5 12.5 0 0 0 6.43 1.76h.01c6.95 0 12.6-5.65 12.6-12.6S22.95 3.2 16 3.2Zm0 22.9h-.01a10.4 10.4 0 0 1-5.29-1.45l-.38-.22-3.78 1.23 1.24-3.68-.25-.39a10.35 10.35 0 0 1-1.6-5.53c0-5.74 4.67-10.4 10.42-10.4 2.78 0 5.39 1.08 7.36 3.05a10.34 10.34 0 0 1 3.05 7.36c0 5.74-4.67 10.4-10.42 10.4Zm5.71-7.79c-.31-.16-1.85-.91-2.14-1.02-.29-.1-.5-.16-.71.16-.21.31-.82 1.02-1 1.24-.19.21-.37.24-.68.08-.31-.16-1.32-.49-2.51-1.55-.93-.83-1.55-1.85-1.74-2.16-.18-.31-.02-.48.14-.63.14-.14.31-.37.47-.55.16-.19.21-.32.31-.53.1-.21.05-.4-.03-.55-.08-.16-.71-1.71-.97-2.34-.26-.62-.52-.53-.71-.54l-.6-.01c-.21 0-.55.08-.84.4-.29.31-1.1 1.08-1.1 2.63s1.13 3.05 1.29 3.26c.16.21 2.22 3.39 5.38 4.75.75.32 1.34.52 1.79.66.75.24 1.44.2 1.98.12.6-.09 1.85-.76 2.11-1.49.26-.73.26-1.36.18-1.49-.08-.13-.29-.21-.6-.37Z"/></svg>
      </span>
    </a>
    <script src="${rel}src/track.js?v=5" defer></script>
    <script src="${rel}src/shopping-assistant.js?v=9" defer></script>
  </body>
</html>
`;
}

async function writeCategoryPages(products, ratingLd) {
  const groups = groupByCategory(products);
  await Promise.all(
    groups.map(async ([cat, list]) => {
      const categoryProducts = cat === "🎃 Halloween"
        ? HALLOWEEN_CAMPAIGN_PRODUCT_IDS
            .map((id) => products.find((product) => product.id === id))
            .filter(Boolean)
        : list;
      const dir = path.join(ROOT, "categoria", categorySlug(cat));
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, "index.html"),
        buildCategoryPage(cat, categoryProducts, products, ratingLd),
      );
    }),
  );
  return groups.length;
}

// Carrete de la portada de /Halloween/ (recortes sin fondo en assets/hero/).
const HALLOWEEN_HERO_SLIDES = [
  { id: "casco-de-stormtrooper", img: "assets/hero/casco-de-stormtrooper.webp", w: 854, h: 883, small: "Novedad", name: "Casco de Stormtrooper", alt: "Casco de Stormtrooper de Star Wars a tamaño real para cosplay" },
  { id: "casco-del-mandaloriano", img: "assets/hero/casco-del-mandaloriano.webp", w: 723, h: 1000, small: "Novedad", name: "Casco del Mandaloriano", alt: "Casco del Mandaloriano con acabado cromado a tamaño real" },
  { id: "tiara-de-ikki-de-fenix-saint-seiya", img: "assets/hero/tiara-de-ikki.webp", w: 596, h: 898, small: "Cosplay", name: "Tiara de Ikki de Fénix", alt: "Tiara de Ikki de Fénix de Saint Seiya en tamaño real" },
  { id: "mascara-krampus", img: "assets/hero/mascara-krampus.webp", w: 894, h: 1000, small: "Terror", name: "Máscara Krampus", alt: "Máscara Krampus de Halloween fabricada por BoomArt" },
  { id: "casco-gladiador-maximo", img: "assets/hero/casco-gladiador-maximo.webp", w: 567, h: 1000, small: "Tamaño real", name: "Casco de Gladiador Máximo", alt: "Casco de Gladiador Máximo con acabado metálico envejecido" },
  { id: "mascara-hellboy-articulada", img: "assets/hero/mascara-hellboy.webp", w: 860, h: 1000, small: "Acabado artesanal", name: "Máscara Hellboy articulada", alt: "Máscara Hellboy articulada fabricada por BoomArt" },
  { id: "casco-de-wolverine-con-garras", img: "assets/hero/casco-de-wolverine.webp", w: 729, h: 868, small: "Marvel", name: "Casco de Wolverine + garras", alt: "Casco de Wolverine con garras impreso en 3D" },
  { id: "casco-de-pegaso-saint-seiya", img: "assets/hero/casco-de-pegaso.webp", w: 917, h: 653, small: "Escala real", name: "Casco de Pegaso", alt: "Casco de Pegaso de Saint Seiya impreso en 3D" },
];

// Carrete de la portada de /saintseiya/.
const SAINT_SEIYA_HERO_SLIDES = [
  { id: "busto-de-atena-saint-seiya", img: "assets/hero/busto-de-atena.webp", w: 494, h: 1000, small: "Saint Seiya", name: "Busto de Atena", alt: "Busto de Atena de Saint Seiya con acabado tipo piedra" },
  { id: "templo-aries", img: "assets/hero/templo-aries.webp", w: 1000, h: 628, small: "12 templos", name: "Templo de Aries", alt: "Templo de Aries de Saint Seiya con su Pandora Box y pedestal" },
  { id: "torre-del-reloj-saint-seiya", img: "assets/hero/torre-del-reloj.webp", w: 358, h: 1000, small: "Santuario", name: "Torre del Reloj", alt: "Torre del Reloj de Fuego del Santuario de Saint Seiya" },
  { id: "diorama-de-pegaso", img: "assets/hero/altar-de-pegaso.webp", w: 861, h: 817, small: "Diorama", name: "Altar de Pegaso", alt: "Altar de Pegaso de Saint Seiya fabricado por BoomArt" },
  { id: "tiara-de-ikki-de-fenix-saint-seiya", img: "assets/hero/tiara-de-ikki.webp", w: 596, h: 898, small: "Cosplay", name: "Tiara de Ikki de Fénix", alt: "Tiara de Ikki de Fénix de Saint Seiya en tamaño real" },
  { id: "casco-de-pegaso-saint-seiya", img: "assets/hero/casco-de-pegaso.webp", w: 917, h: 653, small: "Escala real", name: "Casco de Pegaso", alt: "Casco de Pegaso de Saint Seiya impreso en 3D" },
  { id: "set-santuario-15-piezas", img: "assets/hero/santuario.webp", w: 1000, h: 641, small: "Colección completa", name: "Santuario · 15 piezas", alt: "Set Santuario de Saint Seiya con los 12 templos, la Torre del Reloj y Atena" },
];

function replaceOnce(html, re, replacement, label) {
  if (!re.test(html)) throw new Error(`Página de campaña: no encontré «${label}» en index.html`);
  return html.replace(re, () => replacement);
}

const htmlEscape = (value) =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Página de campaña (2026-10-16, pedido de Adrián): la MISMA portada de boomart.pe
// (encabezado, carrusel, tarjetas con «Agregar», carrito, cupón) pero con portada propia
// y el catálogo ya filtrado (window.BOOMART_FORCE_CATEGORY). Sin «Explora por colección»:
// solo se ven los productos de la campaña. Se genera desde index.html con <base href="/">
// (las rutas relativas siguen funcionando) y su propio título, descripción, canonical y
// vista previa para compartir. Se ejecuta DESPUÉS de actualizar index.html.
async function writeCampaignLanding(products, cfg) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const missing = [...cfg.listIds, ...cfg.slides.map((s) => s.id)].filter((id) => !byId.has(id));
  if (missing.length) {
    throw new Error(`Productos de la campaña ${cfg.dir} no encontrados: ${missing.join(", ")}`);
  }
  const list = cfg.listIds.map((id) => byId.get(id));
  const a = htmlEscape;

  let html = await readFile(path.join(ROOT, "index.html"), "utf8");
  const eol = html.includes("\r\n") ? "\r\n" : "\n";
  const headExtra = [
    `    <base href="/">`,
    `    <script>window.BOOMART_FORCE_CATEGORY = "${cfg.forceCategory}";</script>`,
    cfg.robots ? `    <meta name="robots" content="${cfg.robots}">` : "",
    `    <style>.collections{display:none!important}</style>`,
  ].filter(Boolean).join(eol);
  html = replaceOnce(html, /<head>\r?\n/, `<head>${eol}${headExtra}${eol}`, "<head>");
  html = replaceOnce(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${a(cfg.desc)}">`, "meta description");
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${a(cfg.title)}</title>`, "title");
  html = replaceOnce(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${cfg.canonical}">`, "canonical");
  const metaSet = [
    [/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${a(cfg.title)}">`],
    [/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${a(cfg.desc)}">`],
    [/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${cfg.url}">`],
    [/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${cfg.ogImg}">`],
    [/<meta property="og:image:secure_url" content="[^"]*">/, `<meta property="og:image:secure_url" content="${cfg.ogImg}">`],
    [/<meta property="og:image:width" content="[^"]*">/, `<meta property="og:image:width" content="1200">`],
    [/<meta property="og:image:height" content="[^"]*">/, `<meta property="og:image:height" content="1200">`],
    [/<meta property="og:image:alt" content="[^"]*">/, `<meta property="og:image:alt" content="${a(cfg.ogAlt)}">`],
    [/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${a(cfg.title)}">`],
    [/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${a(cfg.desc)}">`],
    [/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${cfg.ogImg}">`],
    [/<meta name="twitter:image:alt" content="[^"]*">/, `<meta name="twitter:image:alt" content="${a(cfg.ogAlt)}">`],
  ];
  for (const [re, rep] of metaSet) html = replaceOnce(html, re, rep, re.source.slice(0, 40));

  // Portada de campaña (mismo diseño): H1 con las palabras que busca la gente.
  html = replaceOnce(html, /<h1 class="hero-eyebrow" id="heroTitle">[^<]*<\/h1>/,
    `<h1 class="hero-eyebrow" id="heroTitle">${a(cfg.h1)}</h1>`, "H1 de la portada");
  html = replaceOnce(html, /<p class="hero-title">[\s\S]*?<\/p>/,
    `<p class="hero-title is-campaign">${a(cfg.lema)} <span>toma forma.</span></p>`, "lema de la portada");
  html = replaceOnce(html, /<p class="hero-signature">[^<]*<\/p>/,
    `<p class="hero-signature">${a(cfg.signature)}</p>`, "firma de la portada");
  html = replaceOnce(html, /<p class="hero-lead">[^<]*<\/p>/,
    `<p class="hero-lead">${a(cfg.lead)}</p>`, "texto de la portada");

  const pad = "          ";
  const slides = cfg.slides.map((sl, i) => {
    const imgAttr = i < 2
      ? `src="${sl.img}"${i === 0 ? ' fetchpriority="high"' : ' loading="lazy"'}`
      : `data-src="${sl.img}"`;
    return `${pad}<a class="hero-reel-slide${i === 0 ? " is-active" : ""}" href="producto/${sl.id}/" aria-hidden="${i === 0 ? "false" : "true"}" tabindex="${i === 0 ? "0" : "-1"}">${eol}` +
      `${pad}  <img class="hero-reel-photo" ${imgAttr} alt="${a(sl.alt)}" width="${sl.w}" height="${sl.h}" decoding="async">${eol}` +
      `${pad}  <span class="hero-reel-caption"><small>${a(sl.small)}</small><strong>${a(sl.name)}</strong></span>${eol}` +
      `${pad}</a>`;
  }).join(eol);
  const dots = cfg.slides.map((sl, i) =>
    `${pad}  <button class="hero-reel-dot${i === 0 ? " is-active" : ""}" type="button" data-hero-slide="${i}" aria-label="Ver ${a(sl.name)}" aria-pressed="${i === 0}"></button>`).join(eol);
  html = replaceOnce(html,
    /<div class="hero-media hero-reel" id="heroReel"[^>]*>[\s\S]*?<div class="hero-reel-controls"[\s\S]*?<\/div>\s*<\/div>\s*<\/section>/,
    `<div class="hero-media hero-reel" id="heroReel" aria-label="${a(cfg.reelLabel)}" aria-roledescription="carrusel">${eol}${slides}${eol}` +
      `${pad}<div class="hero-reel-controls" role="group" aria-label="Elegir fotografía">${eol}${dots}${eol}${pad}</div>${eol}        </div>${eol}      </section>`,
    "carrete de la portada");

  // Lista de la campaña para buscadores e IA (las tarjetas las dibuja app.js).
  const itemList = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: cfg.h1,
    url: cfg.url,
    description: cfg.desc,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: list.length,
      itemListElement: list.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE}/producto/${p.id}/`,
        name: p.name.replace(/[^\p{L}\p{N}\s·.,:&+()'/-]/gu, "").replace(/\s+/g, " ").trim(),
      })),
    },
  };
  html = replaceOnce(html, /<\/head>/,
    `    <script type="application/ld+json">${JSON.stringify(itemList)}</script>${eol}  </head>`, "</head>");

  // Con <base href="/"> un enlace "#seccion" iría a la portada principal: aquí se
  // queda en esta página y solo se desplaza.
  const anchorFix = `<script>document.addEventListener("click",function(e){var l=e.target.closest&&e.target.closest('a[href^="#"]');if(!l)return;var id=l.getAttribute("href").slice(1);e.preventDefault();var t=id?document.getElementById(id):null;if(t){t.scrollIntoView({behavior:"smooth",block:"start"});}else{window.scrollTo({top:0,behavior:"smooth"});}if(id){history.replaceState(history.state,"",location.pathname+location.search+"#"+id);}},true);</script>`;
  html = replaceOnce(html, /<\/body>/, `    ${anchorFix}${eol}  </body>`, "</body>");

  const dir = path.join(ROOT, cfg.dir);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), html);
  return list.length;
}

async function writeHalloweenCampaignPage(products) {
  const meta = HALLOWEEN_CAMPAIGN_META;
  return writeCampaignLanding(products, {
    dir: "Halloween",
    forceCategory: "halloween",
    listIds: HALLOWEEN_CAMPAIGN_PRODUCT_IDS,
    slides: HALLOWEEN_HERO_SLIDES,
    url: `${SITE}/Halloween/`,
    canonical: `${SITE}/Halloween/`,
    title: meta.title,
    desc: "Máscaras, cascos y accesorios de cosplay para Halloween, impresos en 3D y hechos a pedido en Perú. Stormtrooper, Mandaloriano, Krampus, Hellboy y más, con envíos a todo el país.",
    ogImg: `${SITE}/assets/boomart-halloween-og-cuadrada.jpg`,
    ogAlt: "Halloween en BoomArt: máscaras, cascos y decoración 3D",
    h1: meta.h1,
    lema: "Halloween",
    signature: "Campaña Halloween",
    lead: meta.intro[0],
    reelLabel: "Productos de Halloween de BoomArt",
  });
}

// boomart.pe/saintseiya (enlace de campaña, 2026-10-16): antes redirigía a
// /?categoria=saint-seiya y se veía la portada general; ahora es su propia portada
// con solo productos de Saint Seiya. Sin indexar (el contenido indexable de la
// categoría vive en /categoria/saint-seiya/).
async function writeSaintSeiyaCampaignPage(products) {
  const listIds = products
    .filter((p) => p.category === "Saint Seiya" || (p.extraCategories || []).includes("Saint Seiya"))
    .map((p) => p.id);
  return writeCampaignLanding(products, {
    dir: "saintseiya",
    forceCategory: "saint-seiya",
    robots: "noindex, follow",
    listIds,
    slides: SAINT_SEIYA_HERO_SLIDES,
    url: `${SITE}/saintseiya/`,
    canonical: `${SITE}/categoria/saint-seiya/`,
    title: "Saint Seiya · Templos del Zodiaco impresos en 3D | BoomArt",
    desc: "Los 12 templos del Zodiaco con sus cajas de Pandora, altares, el busto de Atena y más piezas de Saint Seiya impresas en 3D. Hechas a pedido en Perú, con envíos a todo el país.",
    ogImg: `${SITE}/assets/og-saintseiya-cuadrada.jpg`,
    ogAlt: "BoomArt · Saint Seiya: los 12 templos del Zodiaco, Atena y cascos impresos en 3D",
    h1: "Catálogo exclusivo de Saint Seiya · Templos del Zodiaco en 3D",
    lema: "Saint Seiya",
    signature: "Catálogo exclusivo",
    lead: "Los 12 templos del Zodiaco con sus cajas de Pandora, altares, el busto de Atena, cascos y más piezas del Santuario. Hechas a pedido en Perú, con envíos a todo el país.",
    reelLabel: "Productos de Saint Seiya de BoomArt",
  });
}

/* ---------------------------------------------------------------- sitemap.xml */
function buildSitemap(products) {
  const cats = groupByCategory(products).map(([cat]) => cat);
  const urls = [
    { loc: `${SITE}/`, priority: "1.0", changefreq: "weekly" },
    { loc: `${SITE}/catalogo.html`, priority: "0.9", changefreq: "weekly" },
    { loc: `${SITE}/impresion-3d-personalizada/`, priority: "0.9", changefreq: "monthly" },
    { loc: `${SITE}/merchandising-corporativo/`, priority: "0.9", changefreq: "monthly" },
    { loc: `${SITE}/cosplay/`, priority: "0.9", changefreq: "weekly" },
    { loc: `${SITE}/Halloween/`, priority: "0.9", changefreq: "weekly" },
    ...cats.map((c) => ({
      loc: `${SITE}/categoria/${categorySlug(c)}/`,
      priority: "0.7",
      changefreq: "weekly",
    })),
    ...products.map((p) => ({
      loc: `${SITE}/producto/${p.id}/`,
      priority: "0.8",
      changefreq: "monthly",
    })),
    { loc: `${SITE}/nosotros.html`, priority: "0.5", changefreq: "monthly" },
    { loc: `${SITE}/politicas.html`, priority: "0.3", changefreq: "yearly" },
    { loc: `${SITE}/libro-de-reclamaciones.html`, priority: "0.2", changefreq: "yearly" },
  ];
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${NOW}</lastmod>\n` +
          `    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
      )
      .join("\n") +
    `\n</urlset>\n`
  );
}

/* ------------------------------------------------- redes sociales (estaticas) */
// Reescribe, entre marcadores, el bloque "Siguenos" de las paginas HTML escritas a
// mano. La fuente unica de los enlaces es scripts/social-links.mjs.
async function syncSocialBlocks() {
  const targets = [
    ["index.html", [
      ["BOOMART:SOCIAL_FOOTER", socialFooterHtml(), "        "],
      ["BOOMART:SOCIAL_BAND", socialBandHtml(), "      "],
    ]],
    ["nosotros.html", [["BOOMART:SOCIAL_FOOTER", socialFooterHtml(), "        "]]],
    ["politicas.html", [["BOOMART:SOCIAL_FOOTER", socialFooterHtml(), "        "]]],
  ];
  let changed = false;
  for (const [file, blocks] of targets) {
    const full = path.join(ROOT, file);
    const original = await readFile(full, "utf8");
    const eol = original.includes("\r\n") ? "\r\n" : "\n";
    let html = original;
    for (const [name, content, indent] of blocks) {
      const re = new RegExp(`<!-- ${name}:START -->[\\s\\S]*?<!-- ${name}:END -->`);
      if (!re.test(html)) throw new Error(`${file}: faltan los marcadores ${name}`);
      const body = content.replace(/\n/g, eol);
      html = html.replace(re, () => `<!-- ${name}:START -->${eol}${body}${eol}${indent}<!-- ${name}:END -->`);
    }
    if (html !== original) {
      await writeFile(full, html);
      changed = true;
    }
  }
  return changed;
}

/* ---------------------------------------------------------------- main */
const [products, reviews] = await Promise.all([loadProducts(), loadReviews()]);
const ratingLd = buildRatingLd(reviews);

const [productPageCount, categoryPageCount] = await Promise.all([
  writeProductPages(products, ratingLd),
  writeCategoryPages(products, ratingLd),
  writeFile(path.join(ROOT, "catalogo.html"), buildHtml(products, ratingLd, reviews)),
  writeFile(path.join(ROOT, "catalogo.json"), buildJson(products) + "\n"),
  writeFile(path.join(ROOT, "sitemap.xml"), buildSitemap(products)),
  writeFile(path.join(ROOT, "llms.txt"), buildLlms(products, reviews)),
  writeFile(path.join(ROOT, "llms-full.txt"), buildLlmsFull(products)),
  writeFile(path.join(ROOT, "feed-google.xml"), buildGoogleFeed(products)),
  writeFile(path.join(ROOT, "feed-meta.csv"), buildMetaFeed(products)),
]);

// Secuencial (no Promise.all): ambas leen y reescriben index.html/opinion,
// asi que si corrieran en paralelo la segunda podria pisar el cambio de la
// primera (cada una parte de su propia lectura del archivo).
const ratingUpdated = await injectRatingIntoIndex(ratingLd);
const reviewsBlocksUpdated = await injectReviewsBlocks(reviews);
const socialBlocksUpdated = await syncSocialBlocks();
// Despues de actualizar index.html: /Halloween/ es una copia de la portada.
await writeHalloweenCampaignPage(products);
await writeSaintSeiyaCampaignPage(products);

console.log(
  `OK - generado desde ${products.length} productos` +
    ` y ${reviews.length} opiniones aprobadas:\n` +
    `  producto/<id>/index.html  (${productPageCount} paginas)\n` +
    `  categoria/<slug>/index.html  (${categoryPageCount} paginas)\n` +
    `  Halloween/index.html (campaña de ${HALLOWEEN_CAMPAIGN_PRODUCT_IDS.length} productos)\n` +
    "  sitemap.xml\n  catalogo.html\n  catalogo.json\n  llms.txt\n  llms-full.txt\n" +
    "  feed-google.xml (Google Merchant + Pinterest)\n  feed-meta.csv (Instagram / Facebook)\n" +
    `  index.html (aggregateRating ${ratingUpdated ? "actualizado" : "sin cambios"})\n` +
    `  index.html + opinion/index.html (opiniones en texto plano ${reviewsBlocksUpdated ? "actualizadas" : "sin cambios"})\n` +
    `  redes sociales en index/nosotros/politicas (${socialBlocksUpdated ? "actualizadas" : "sin cambios"})`,
);
