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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://boomart.pe";
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

const waLink = (name) =>
  `${WHATSAPP}?text=${encodeURIComponent(`Hola BoomArt, quiero consultar por: ${name}`)}`;

/**
 * Precios de un producto, en soles (PEN). Devuelve:
 *   from       precio de referencia ("desde")
 *   lines      desglose legible para humanos
 *   listPrice  precio de lista para los feeds (Google/Meta/Pinterest)
 *   salePrice  precio rebajado, o null si no hay oferta
 */
function priceInfo(p) {
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
      salePrice: null,
    };
  }
  const regular = typeof p.regularPrice === "number" ? p.regularPrice : null;
  const offer = typeof p.offerPrice === "number" ? p.offerPrice : null;
  const current = offer ?? regular;
  const discounted = offer && regular && offer < regular;
  const lines = [];
  if (discounted) lines.push(`Precio oferta: S/${offer} (antes S/${regular})`);
  else if (current != null) lines.push(`Precio: S/${current}`);
  return {
    from: current,
    lines,
    listPrice: discounted ? regular : current,
    salePrice: discounted ? offer : null,
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

// Costo de envio de referencia declarado a Google (Shopping / structured data).
// El cobro real se confirma por WhatsApp segun destino; esto es el "desde".
const SHIPPING_FROM = 15;

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

// Reescribe la region marcada de index.html con el <script> de aggregateRating.
async function injectRatingIntoIndex(ratingLd) {
  const file = path.join(ROOT, "index.html");
  const html = await readFile(file, "utf8");
  const start = "<!-- BOOMART:RATING:START";
  const end = "<!-- BOOMART:RATING:END -->";
  const i = html.indexOf(start);
  const j = html.indexOf(end);
  if (i === -1 || j === -1) return false;
  const iEnd = html.indexOf("-->", i) + 3;
  const block = ratingLd
    ? `\n    <script type="application/ld+json">${JSON.stringify(ratingLd)}</script>\n    `
    : "\n    ";
  const next = html.slice(0, iEnd) + block + html.slice(j);
  if (next === html) return false;
  await writeFile(file, next);
  return true;
}

const SHIPPING_LD = {
  "@type": "OfferShippingDetails",
  shippingRate: {
    "@type": "MonetaryAmount",
    value: String(SHIPPING_FROM),
    currency: "PEN",
  },
  shippingDestination: { "@type": "DefinedRegion", addressCountry: "PE" },
  deliveryTime: {
    "@type": "ShippingDeliveryTime",
    handlingTime: {
      "@type": "QuantitativeValue",
      minValue: 2,
      maxValue: 3,
      unitCode: "DAY",
    },
    transitTime: {
      "@type": "QuantitativeValue",
      minValue: 1,
      maxValue: 7,
      unitCode: "DAY",
    },
  },
};

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
      contact: { whatsapp: WHATSAPP, email: "contacto@boomart.pe", instagram: "https://www.instagram.com/boomart_3d" },
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
          shippingDetails: SHIPPING_LD,
        };
      }
      return product;
    }),
  };
}

/* ---------------------------------------------------------------- catalogo.html */
function buildHtml(products, ratingLd) {
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
                `<img src="${esc(abs(img))}" alt="${esc(p.name)}" width="320" height="320" loading="lazy">`,
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
    <link rel="icon" type="image/svg+xml" href="assets/boomart-logo.svg">
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
    <link rel="stylesheet" href="src/styles.css?v=20">
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

      <section id="contacto-final">
        <h2>Como comprar</h2>
        <p>
          Todas las piezas se fabrican a pedido en impresion 3D (PLA+/PETG),
          con acabado y detallado a mano. Fabricacion aproximada: 48 horas utiles
          desde la validacion del adelanto (50%). El envio se coordina aparte por
          WhatsApp: a domicilio en Lima y Callao, y por agencia Shalom a provincias.
        </p>
        <p><a href="${WHATSAPP}" target="_blank" rel="noreferrer">Escribir a BoomArt por WhatsApp</a> &middot;
           <a href="mailto:contacto@boomart.pe">contacto@boomart.pe</a> &middot;
           <a href="https://www.instagram.com/boomart_3d" target="_blank" rel="noreferrer">Instagram @boomart_3d</a></p>
      </section>
    </main>

    <footer class="footer">
      <div>
        <strong>BOOM ART</strong>
        <p>Piezas hechas a pedido. Consulta disponibilidad, colores, acabados y tiempos de entrega por WhatsApp.</p>
        <p><a href="mailto:contacto@boomart.pe">contacto@boomart.pe</a></p>
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
- [Feed Google/Pinterest (XML)](${SITE}/feed-google.xml): formato Google Merchant Center.
- [Feed Meta (CSV)](${SITE}/feed-meta.csv): catalogo para Instagram y Facebook.
- [Datos del panel de administracion](${SITE}/data/products.json): fuente original.

## Paginas

- [Inicio / tienda interactiva](${SITE}/): catalogo con carrito y checkout.
- [Nosotros](${SITE}/nosotros.html): quienes somos y como trabajamos.
- [Politicas](${SITE}/politicas.html): compra, envio y privacidad.

## Categorias

${cats}

## Contacto

- WhatsApp: ${WHATSAPP}
- Correo: contacto@boomart.pe
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
${price.salePrice != null ? `      <g:sale_price>${money(price.salePrice)}</g:sale_price>\n` : ""}      <g:condition>new</g:condition>
      <g:shipping>
        <g:country>PE</g:country>
        <g:price>${money(SHIPPING_FROM)}</g:price>
      </g:shipping>
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
    "sale_price",
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
      price.salePrice != null ? money(price.salePrice) : "",
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
  "Mundial de Futbol": "pieza de colección para fanáticos del fútbol",
  "Mundial de Fútbol": "pieza de colección para fanáticos del fútbol",
};
const catContext = (p) =>
  CAT_CONTEXT[p.category] || "figura de colección impresa en 3D";

const stripEmoji = (s) =>
  String(s ?? "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️‍]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

function pageTitle(p) {
  const cat = stripEmoji(p.category);
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
    shippingDetails: SHIPPING_LD,
  };
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
    category: stripEmoji(p.category),
    brand: { "@type": "Brand", name: "BoomArt" },
    offers: offerLd(p),
  };
  if (p.material) ld.material = p.material;
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
        name: stripEmoji(p.category),
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
    .pp-main-img{width:100%;height:auto;aspect-ratio:1/1;object-fit:cover;border-radius:14px;border:1px solid var(--line);background:#fff;display:block}
    .pp-thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    .pp-thumbs button{padding:0;border:1px solid var(--line);border-radius:8px;background:#fff;cursor:pointer;width:62px;height:62px;overflow:hidden}
    .pp-thumbs button[aria-current="true"]{border-color:var(--red);border-width:2px}
    .pp-thumbs img{width:100%;height:100%;object-fit:cover;display:block}
    .pp-info h1{margin:2px 0 4px;font-size:clamp(1.55rem,4vw,2.35rem);line-height:1.1}
    .pp-sub{color:var(--muted);margin:0 0 16px}
    .pp-rating{font-size:.9rem;margin:0 0 16px}
    .pp-rating a{text-decoration:none;font-weight:700}
    .pp-price{border:1px solid var(--line);border-radius:12px;padding:15px 16px;margin:0 0 16px}
    .pp-price .now{font-size:1.45rem;font-weight:800}
    .pp-price .was{color:var(--muted);text-decoration:line-through;margin-left:8px;font-weight:600}
    .pp-price ul{margin:8px 0 0;padding-left:18px}
    .pp-price li{margin:3px 0}
    .pp-cta{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 6px}
    .pp-specs{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:18px 0 0}
    .pp-specs div{border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-size:.92rem}
    .pp-specs span{display:block;font-size:.7rem;font-weight:800;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
    .pp-body{margin-top:34px;max-width:70ch;line-height:1.65}
    .pp-body h2{font-size:1.15rem;margin:22px 0 8px}
    .pp-body p{margin:0 0 12px}
    .pp-related{margin-top:44px}
    .pp-related h2{font-size:1.15rem;margin:0 0 14px}
    .pp-rel-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
    .pp-rel-grid a{text-decoration:none;color:inherit;border:1px solid var(--line);border-radius:10px;overflow:hidden;display:block}
    .pp-rel-grid img{width:100%;height:auto;aspect-ratio:1/1;object-fit:cover;display:block}
    .pp-rel-grid span{display:block;padding:8px 10px;font-size:.85rem;font-weight:600}
    @media(max-width:760px){.pp-top{grid-template-columns:1fr}}
`;

function priceBlockHtml(p) {
  const price = priceInfo(p);
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
  const now = price.salePrice != null ? price.salePrice : price.from;
  const was = price.salePrice != null ? price.listPrice : null;
  if (now == null) return `<div class="pp-price"><span class="now">Precio a consultar</span></div>`;
  return `<div class="pp-price"><span class="now">S/${now}</span>${was ? `<span class="was">S/${was}</span>` : ""}</div>`;
}

function buildProductPage(p, all, ratingLd) {
  const imgs = (p.gallery && p.gallery.length ? p.gallery : [p.image]).filter(Boolean);
  const rel = "../../";
  const url = `${SITE}/producto/${p.id}/`;
  const title = pageTitle(p);
  const desc = pageDescription(p);
  const price = priceInfo(p);
  const wa = waLink(p.name);
  const shop = `${rel}index.html?producto=${encodeURIComponent(p.id)}`;
  const catClean = stripEmoji(p.category);
  const ctx = catContext(p);

  const mainImgRel = `${rel}${String(imgs[0]).replace(/^\/+/, "")}`;
  const thumbs = imgs
    .map(
      (img, i) =>
        `<button type="button" data-src="${esc(`${rel}${String(img).replace(/^\/+/, "")}`)}" aria-current="${i === 0}"><img src="${esc(`${rel}${String(img).replace(/^\/+/, "")}`)}" alt="${esc(p.name)} - vista ${i + 1}" loading="lazy" width="62" height="62"></button>`,
    )
    .join("\n            ");

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
        `<a href="../${esc(r.id)}/"><img src="${esc(`${rel}${String((r.gallery && r.gallery[0]) || r.image).replace(/^\/+/, "")}`)}" alt="${esc(r.name)}" loading="lazy" width="180" height="180"><span>${esc(r.name)}</span></a>`,
    )
    .join("\n          ");

  const ratingStr = ratingLd && ratingLd.aggregateRating
    ? `<p class="pp-rating">&#9733; ${ratingLd.aggregateRating.ratingValue} / 5 &middot; <a href="${rel}opinion/">${ratingLd.aggregateRating.reviewCount} opiniones de clientes</a></p>`
    : "";

  const priceMeta =
    price.from != null
      ? `\n    <meta property="product:price:amount" content="${price.salePrice != null ? price.salePrice : price.from}">\n    <meta property="product:price:currency" content="PEN">`
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
    <link rel="icon" type="image/svg+xml" href="${rel}assets/boomart-logo.svg">
    <meta property="og:type" content="product">
    <meta property="og:site_name" content="BoomArt">
    <meta property="og:title" content="${esc(p.name)} | BoomArt">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${esc(abs(imgs[0]))}">
    <meta property="og:locale" content="es_PE">${priceMeta}
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(p.name)} | BoomArt">
    <meta name="twitter:description" content="${esc(desc)}">
    <meta name="twitter:image" content="${esc(abs(imgs[0]))}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="${rel}src/styles.css?v=20">
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
          <img class="pp-main-img" id="ppMain" src="${esc(mainImgRel)}" alt="${esc(p.name)} · figura impresa en 3D por BoomArt" width="640" height="640">
          ${imgs.length > 1 ? `<div class="pp-thumbs" id="ppThumbs">\n            ${thumbs}\n          </div>` : ""}
        </div>
        <div class="pp-info">
          <p class="eyebrow">${esc(catClean)}</p>
          <h1>${esc(p.name)}</h1>
          <p class="pp-sub">${esc(String(p.description || `${p.name}: ${ctx}.`).replace(/\s+/g, " ").trim())}</p>
          ${ratingStr}
          ${priceBlockHtml(p)}
          <div class="pp-cta">
            <a class="button primary" href="${esc(shop)}">Ver en la tienda y agregar al carrito</a>
            <a class="button secondary" href="${esc(wa)}" target="_blank" rel="noreferrer nofollow">Consultar por WhatsApp</a>
          </div>
          <div class="pp-specs">
            <div><span>Material</span>${esc(p.material || "PLA+")}</div>
            <div><span>Formato</span>${esc(p.height || "Consultar medidas por WhatsApp")}</div>
            <div><span>Disponibilidad</span>${esc(p.availability || "A pedido")}</div>
            <div><span>Producción</span>~48 h útiles</div>
            <div><span>Categoría</span>${esc(catClean)}</div>
            <div><span>Envío</span>A todo el Perú (desde S/15, aparte)</div>
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
        <p>Entregamos a domicilio en Lima y Callao coordinando por WhatsApp, y a provincias por la agencia Shalom. El costo de envío va aparte (desde S/15 referencial) y se paga directo al courier. <a href="${rel}politicas.html">Ver políticas de compra y envío</a>.</p>
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
        <strong>BOOM ART</strong>
        <p>Piezas hechas a pedido. Consulta disponibilidad, colores, acabados y tiempos de entrega por WhatsApp.</p>
        <p><a href="mailto:contacto@boomart.pe">contacto@boomart.pe</a></p>
        <ul class="footer-links">
          <li><a href="${rel}catalogo.html">Catálogo completo</a></li>
          <li><a href="${rel}nosotros.html">Nosotros</a></li>
          <li><a href="${rel}politicas.html">Políticas de compra, envío y privacidad</a></li>
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
        var thumbs = document.getElementById("ppThumbs");
        var main = document.getElementById("ppMain");
        if (!thumbs || !main) return;
        thumbs.addEventListener("click", function (e) {
          var btn = e.target.closest("button[data-src]");
          if (!btn) return;
          main.src = btn.getAttribute("data-src");
          thumbs.querySelectorAll("button").forEach(function (b) {
            b.setAttribute("aria-current", b === btn);
          });
        });
      })();
    </script>
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
    h1: "Figuras y máscaras de Halloween en 3D",
    title: "Máscaras y decoración de Halloween impresas en 3D · Perú | BoomArt",
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
    .cat-card img{width:100%;height:auto;aspect-ratio:1/1;object-fit:cover;display:block}
    .cat-card .b{padding:10px 12px;display:flex;flex-direction:column;gap:4px}
    .cat-card .n{font-weight:700;font-size:.92rem;line-height:1.25}
    .cat-card .p{font-size:.9rem;color:var(--muted)}
    .cat-more{margin-top:28px}
`;

function categorySlug(cat) {
  return slug(cat);
}

function buildCategoryPage(cat, list, all, ratingLd) {
  const meta = CATEGORY_META[cat] || {
    h1: `${stripEmoji(cat)} impresas en 3D`,
    title: `${stripEmoji(cat)} en impresión 3D · Perú | BoomArt`,
    intro: [
      `Figuras y piezas de ${stripEmoji(cat)} impresas en 3D, hechas a pedido en Lima y Callao con envíos a todo el Perú.`,
    ],
  };
  const rel = "../../";
  const s = categorySlug(cat);
  const url = `${SITE}/categoria/${s}/`;
  const clean = stripEmoji(cat);
  const wa = `${WHATSAPP}?text=${encodeURIComponent(`Hola BoomArt, quiero consultar por el catálogo de ${clean}`)}`;
  const ogImg = abs((list[0] && (list[0].gallery && list[0].gallery[0])) || (list[0] && list[0].image)) || `${SITE}/assets/boomart-og.jpg`;
  const desc = clampWords(meta.intro[0], 155);

  const cards = list
    .map((p) => {
      const price = priceInfo(p);
      const pr =
        price.salePrice != null
          ? `S/${price.salePrice}`
          : price.from != null
            ? (p.templePricing ? `desde S/${price.from}` : `S/${price.from}`)
            : "Consultar";
      const img = `${rel}${String((p.gallery && p.gallery[0]) || p.image).replace(/^\/+/, "")}`;
      return `        <a class="cat-card" href="${rel}producto/${esc(p.id)}/">
          <img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" width="240" height="240">
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
    .map((c) => `<li><a href="${rel}categoria/${categorySlug(c)}/">${esc(stripEmoji(c))}</a></li>`)
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
    <link rel="icon" type="image/svg+xml" href="${rel}assets/boomart-logo.svg">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="BoomArt">
    <meta property="og:title" content="${esc(meta.h1)} | BoomArt">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${esc(ogImg)}">
    <meta property="og:locale" content="es_PE">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(meta.h1)} | BoomArt">
    <meta name="twitter:description" content="${esc(desc)}">
    <meta name="twitter:image" content="${esc(ogImg)}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="${rel}src/styles.css?v=20">
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
        <strong>BOOM ART</strong>
        <p>Piezas hechas a pedido. Consulta disponibilidad, colores, acabados y tiempos de entrega por WhatsApp.</p>
        <p><a href="mailto:contacto@boomart.pe">contacto@boomart.pe</a></p>
        <ul class="footer-links">
          ${catNav}
        </ul>
        <ul class="footer-links">
          <li><a href="${rel}catalogo.html">Catálogo completo</a></li>
          <li><a href="${rel}nosotros.html">Nosotros</a></li>
          <li><a href="${rel}politicas.html">Políticas de compra, envío y privacidad</a></li>
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
  </body>
</html>
`;
}

async function writeCategoryPages(products, ratingLd) {
  const groups = groupByCategory(products);
  await Promise.all(
    groups.map(async ([cat, list]) => {
      const dir = path.join(ROOT, "categoria", categorySlug(cat));
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, "index.html"),
        buildCategoryPage(cat, list, products, ratingLd),
      );
    }),
  );
  return groups.length;
}

/* ---------------------------------------------------------------- sitemap.xml */
function buildSitemap(products) {
  const cats = groupByCategory(products).map(([cat]) => cat);
  const urls = [
    { loc: `${SITE}/`, priority: "1.0", changefreq: "weekly" },
    { loc: `${SITE}/catalogo.html`, priority: "0.9", changefreq: "weekly" },
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

/* ---------------------------------------------------------------- main */
const [products, reviews] = await Promise.all([loadProducts(), loadReviews()]);
const ratingLd = buildRatingLd(reviews);

const [productPageCount, categoryPageCount] = await Promise.all([
  writeProductPages(products, ratingLd),
  writeCategoryPages(products, ratingLd),
  writeFile(path.join(ROOT, "catalogo.html"), buildHtml(products, ratingLd)),
  writeFile(path.join(ROOT, "catalogo.json"), buildJson(products) + "\n"),
  writeFile(path.join(ROOT, "sitemap.xml"), buildSitemap(products)),
  writeFile(path.join(ROOT, "llms.txt"), buildLlms(products)),
  writeFile(path.join(ROOT, "llms-full.txt"), buildLlmsFull(products)),
  writeFile(path.join(ROOT, "feed-google.xml"), buildGoogleFeed(products)),
  writeFile(path.join(ROOT, "feed-meta.csv"), buildMetaFeed(products)),
  injectRatingIntoIndex(ratingLd),
]);

console.log(
  `OK - generado desde ${products.length} productos` +
    ` y ${reviews.length} opiniones aprobadas:\n` +
    `  producto/<id>/index.html  (${productPageCount} paginas)\n` +
    `  categoria/<slug>/index.html  (${categoryPageCount} paginas)\n` +
    "  sitemap.xml\n  catalogo.html\n  catalogo.json\n  llms.txt\n  llms-full.txt\n" +
    "  feed-google.xml (Google Merchant + Pinterest)\n  feed-meta.csv (Instagram / Facebook)\n" +
    `  index.html (aggregateRating ${ratingLd ? "actualizado" : "sin cambios: aun sin opiniones"})`,
);
