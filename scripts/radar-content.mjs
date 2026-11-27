import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE = "https://boomart.pe";
const SOCIAL_IMAGE = "/assets/boomart-og.jpg";
const SECTIONS = {
  figuras: "Figuras", manga: "Manga", anime: "Anime y cine",
  videojuegos: "Videojuegos", aniversarios: "Aniversarios", curiosidades: "Curiosidades",
};
const MONTH = new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const route = (post) => `/radar/${post.slug}/`;
const dateText = (day) => DAY.format(new Date(`${day}T12:00:00Z`));
const monthText = (month) => MONTH.format(new Date(`${month}-01T12:00:00Z`));
const publisher = { "@type": "Organization", name: "BoomArt", url: `${SITE}/` };
const hasHttps = (value) => typeof value === "string" && /^https:\/\//.test(value) && URL.canParse(value);
const isDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && new Date(value).toJSON()?.slice(0, 10) === value;
const validLink = ({ url, label }) => typeof label === "string" && label.trim() && hasHttps(url);

const imageUrl = (image) => new URL(image.src, SITE).href;

function validImage(image) {
  if (!image || !image.alt || !image.caption || !image.credit || !hasHttps(image.source)) return false;
  const pressAsset = typeof image.src === "string" && /^\/assets\/radar\/prensa\/[\w.-]+$/.test(image.src)
    && !image.src.includes("..") && hasHttps(image.original);
  return (pressAsset || hasHttps(image.src))
    && Number.isInteger(image.width) && Number.isInteger(image.height) && image.width > 0 && image.height > 0;
}

export async function readRadarPosts(root) {
  const posts = JSON.parse(await readFile(path.join(root, "data/radar-noticias.json"), "utf8"));
  if (!Array.isArray(posts) || !posts.length) throw new Error("El Radar necesita al menos una nota.");
  const seen = new Set();
  for (const post of posts) {
    const calendar = !post.release || (/^\d{4}-(0[1-9]|1[0-2])$/.test(post.release) && post.market);
    const sources = Array.isArray(post.sources) && post.sources.length && post.sources.every(validLink);
    const text = [post.title, post.type, post.description, post.question].every(value => typeof value === "string" && value.trim());
    const paragraphs = Array.isArray(post.paragraphs) && post.paragraphs.length && post.paragraphs.every(value => typeof value === "string" && value.trim());
    const cover = validImage(post.cover);
    const gallery = !post.gallery || (Array.isArray(post.gallery) && post.gallery.every(validImage));
    const media = !post.mediaLinks || (Array.isArray(post.mediaLinks) && post.mediaLinks.every(validLink));
    const date = isDate(post.date) && (!post.announcementDate || isDate(post.announcementDate));
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) || seen.has(post.slug) ||
        !Object.hasOwn(SECTIONS, post.category) || !date ||
        !calendar || !sources || !text || !paragraphs || !cover || !gallery || !media) throw new Error(`Nota del Radar inválida: ${post.slug}`);
    seen.add(post.slug);
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

export function radarSitemap(posts) {
  return ["/radar/", ...posts.map(route)].map(url => ({ loc: SITE + url, priority: "0.6", changefreq: url === "/radar/" ? "daily" : "monthly" }));
}

export function radarLlms(posts) {
  return [
    "- [Radar Saint Seiya Perú](https://boomart.pe/radar/): portal editorial de BoomArt con novedades de figuras licenciadas, manga, anime, cine y videojuegos, aniversarios y curiosidades. Incluye fuentes y distingue el lanzamiento de la llegada a Perú.",
    ...posts.slice(0, 5).map(post => `- [${post.title}](${SITE + route(post)}): ${post.description}`),
  ].join("\n");
}

function siteFrame({ title, description, url, schema, content, cover, modules = [], privatePage = false }) {
  const meta = privatePage ? '<meta name="robots" content="noindex,follow">' : `<link rel="canonical" href="${SITE + url}">
    <meta property="og:type" content="${url === "/radar/" ? "website" : "article"}">
    <meta property="og:title" content="${escape(title)}">
    <meta property="og:description" content="${escape(description)}">
    <meta property="og:url" content="${SITE + url}">
    <meta property="og:image" content="${escape(cover ? imageUrl(cover) : SITE + SOCIAL_IMAGE)}">${cover ? `\n    <meta property="og:image:alt" content="${escape(cover.alt)}">` : ""}
    <meta property="og:locale" content="es_PE">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="alternate" type="application/rss+xml" title="Radar Saint Seiya Perú" href="/radar/feed.xml">
    <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...schema }).replace(/</g, "\\u003c")}</script>`;
  const needsCommunity = modules.includes("radar-comunidad") || modules.includes("radar-moderar");
  const scripts = [
    ...(needsCommunity ? ['<script src="/vitrina/vendor/supabase-js-2.117.2.umd.js" defer></script>', '<script src="/src/supabase-config.js" defer></script>'] : []),
    ...modules.map(name => `<script type="module" src="/src/${name}.js?v=2"></script>`),
  ].join("\n    ");
  return `<!doctype html>
<html lang="es-PE">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escape(title)} | BoomArt</title>
    <meta name="description" content="${escape(description)}">
    ${meta}
    <link rel="icon" type="image/svg+xml" href="/assets/boomart-mark.svg?v=7">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/src/styles.css?v=69">
    <link rel="stylesheet" href="/src/radar.css?v=2">
    ${scripts}
  </head>
  <body class="radar-site">
    <a class="radar-skip" href="#contenido">Ir al contenido</a>
    <header class="site-header">
      <a class="brand" href="/" aria-label="BoomArt inicio"><img class="brand-logo" src="/assets/boomart-logo.svg" alt=""><span><strong>BoomArt</strong></span></a>
      <nav aria-label="Secciones de BoomArt">
        <a href="/radar/"${url === "/radar/" ? ' aria-current="page"' : ""}>Radar Saint Seiya</a>
        <a href="/historias/">Historias</a>
        <a href="/categoria/saint-seiya/">Catálogo</a>
      </nav>
    </header>
    ${content}
    <footer class="radar-footer">
      <div class="radar-wrap">
        <p>Radar Saint Seiya Perú · Un proyecto editorial independiente de BoomArt</p>
        <nav aria-label="Enlaces del Radar"><a href="/radar/feed.xml">Suscríbete por RSS</a><a href="/politicas.html">Privacidad</a><a href="mailto:contacto@boomart.pe">Contacta a la redacción</a></nav>
      </div>
    </footer>
  </body>
</html>
`;
}

function editorialImage(photo, className, priority = false) {
  const loading = priority ? 'fetchpriority="high"' : 'loading="lazy"';
  return `<figure class="${className}">
      <img src="${escape(photo.src)}" width="${photo.width}" height="${photo.height}" alt="${escape(photo.alt)}" ${loading}>
      <figcaption>${escape(photo.caption)} <a href="${escape(photo.source)}">${escape(photo.credit)}</a></figcaption>
    </figure>`;
}

function feature(post) {
  return `<article class="radar-feature">
    <div class="radar-feature-copy">
      <p class="radar-label">${escape(post.type)}</p>
      <h2><a href="${route(post)}">${escape(post.title)}</a></h2>
      <p>${escape(post.description)}</p>
      <a class="radar-action" href="${route(post)}">Leer la nota <span aria-hidden="true">→</span></a>
    </div>
    ${editorialImage(post.cover, "radar-feature-photo", true)}
  </article>`;
}

function homepage(posts) {
  const calendar = posts.filter(post => post.release).sort((a, b) => a.release.localeCompare(b.release));
  return siteFrame({
    title: "Radar Saint Seiya Perú", url: "/radar/", cover: posts[0].cover,
    description: "Noticias de Saint Seiya para coleccionistas de Perú. Nuevas figuras, manga, anime, cine, videojuegos, aniversarios y curiosidades.",
    schema: { "@type": "Blog", name: "Radar Saint Seiya Perú", url: `${SITE}/radar/`, inLanguage: "es-PE", publisher },
    modules: ["radar-indice"],
    content: `<main id="contenido" class="radar">
      <div class="radar-wrap">
        <div class="radar-masthead">
          <h1>Radar Saint Seiya <span>Perú</span></h1>
          <p>Noticias, fechas y hallazgos para quienes coleccionan, leen y siguen Los Caballeros del Zodiaco.</p>
          <nav aria-label="En esta página"><a href="#ultimas-notas">Últimas notas</a><a href="#calendario">Calendario</a></nav>
        </div>
        ${feature(posts[0])}
        <section class="radar-folio" id="ultimas-notas" aria-labelledby="titulo-notas">
          <h2 id="titulo-notas">Últimas notas</h2>
          <form class="radar-filters" id="radar-filters" hidden>
            <label>Buscar una nota <input type="search" name="buscar" placeholder="Pegaso, manga, Blokees…"></label>
            <label>Tema <select name="tema"><option value="">Todos los temas</option>${Object.entries(SECTIONS).map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</select></label>
          </form>
          <p class="radar-feedback" id="radar-filter-status" role="status" hidden></p>
          <div class="radar-cards" id="radar-cards">
            ${posts.map(post => `<article class="radar-card" data-section="${post.category}">
              <img class="radar-card-photo" src="${escape(post.cover.src)}" width="${post.cover.width}" height="${post.cover.height}" alt="${escape(post.cover.alt)}" loading="lazy">
              <p class="radar-label">${SECTIONS[post.category]} · ${escape(post.type)}</p>
              <h3><a href="${route(post)}">${escape(post.title)}</a></h3>
              <p>${escape(post.description)}</p>
              <time datetime="${post.date}">${dateText(post.date)}</time>
            </article>`).join("\n            ")}
          </div>
        </section>
        <section class="radar-folio" id="calendario" aria-labelledby="titulo-calendario">
          <h2 id="titulo-calendario">Calendario de lanzamientos</h2>
          <p>Las fechas corresponden al mercado indicado. Aquí actualizamos el estado cuando verificamos una llegada a Perú.</p>
          <div class="radar-calendar">
            ${calendar.length ? calendar.map(post => `<article>
              <time datetime="${post.release}">${monthText(post.release)} · ${escape(post.market)}</time>
              <h3><a href="${route(post)}">${escape(post.title)}</a></h3>
              <p>Perú · ${escape(post.peru || "Por verificar")}</p>
            </article>`).join("\n            ") : "<p>El calendario se actualizará con el siguiente lanzamiento confirmado.</p>"}
          </div>
        </section>
        <section class="radar-folio radar-related">
          <h2>Del anuncio a la vitrina</h2>
          <p>Explora cómo un coleccionista arma sus escenas con las piezas que encarga al taller.</p>
          <a href="/historias/vitrina-de-saint-seiya/">Leer la historia de su vitrina <span aria-hidden="true">→</span></a>
        </section>
      </div>
    </main>`,
  });
}

function loginForm() {
  return `<div data-login class="radar-login" hidden>
    <form data-sign-in>
      <label>Correo electrónico <input name="correo" type="email" autocomplete="email" required maxlength="254"></label>
      <button class="radar-action" type="submit">Entrar con mi correo</button>
      <p class="radar-small" data-login-hint>Te enviaremos un enlace de acceso. En la conversación se verá tu alias.</p>
    </form>
  </div>`;
}

function community(post) {
  return `<section class="radar-comunidad" id="comunidad" aria-labelledby="titulo-comunidad" data-radar-topic="${post.slug}">
    <h2 id="titulo-comunidad">Comunidad</h2>
    <p class="radar-discussion-question">${escape(post.question)}</p>
    <noscript><p>Activa JavaScript para valorar la nota o participar en la conversación.</p></noscript>
    <p data-preview class="radar-preview" hidden>Vista de prueba. Las participaciones se guardan solo en este navegador.</p>
    <p data-session class="radar-session" hidden>Sesión abierta <button type="button" class="radar-text-button" data-sign-out>Cerrar sesión</button></p>
    <p data-status class="radar-feedback" role="status">Cargando conversación…</p>
    ${loginForm()}
    <div data-community-content hidden>
      <form data-vote class="radar-rating">
        <fieldset><legend>Valora la nota</legend>
        <div class="radar-stars">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="rating" value="${n}" aria-label="${n} de 5 estrellas"><span aria-hidden="true">★</span></label>`).join("")}</div></fieldset>
        <button class="radar-action radar-action-secondary" type="submit">Guardar voto</button>
        <p class="radar-small" data-rating-result>Aún sin valoraciones.</p>
      </form>
      <section aria-label="Comentarios en la nota">
        <h3>Conversación</h3>
        <div data-entries></div>
        <form data-contribution hidden class="radar-comment-form">
          <p data-reply-label hidden></p>
          <button class="radar-text-button" type="button" data-cancel-reply hidden>Cancelar respuesta</button>
          <label>Alias público <input name="alias" required minlength="2" maxlength="30" autocomplete="nickname"></label>
          <label>Tu aporte <textarea name="mensaje" required minlength="5" maxlength="1200" rows="4" placeholder="Comparte un dato, una pregunta o la historia de tu foto."></textarea></label>
          <label>Foto de tu colección (opcional) <input name="foto" type="file" accept="image/jpeg,image/png,image/webp"></label>
          <label data-photo-consent class="radar-check" hidden><input name="permiso" type="checkbox"> Tengo permiso para publicar esta fotografía.</label>
          <button class="radar-action" type="submit">Enviar a revisión</button>
          <p class="radar-small">Tu alias, comentario y foto se hacen públicos después de la aprobación. Puedes pedir su retiro a contacto@boomart.pe.</p>
        </form>
      </section>
    </div>
  </section>`;
}

function article(post) {
  const image = editorialImage(post.cover, "radar-article-cover", true);
  const gallery = (post.gallery || []).map(photo => editorialImage(photo, "radar-article-cover")).join("\n");
  const media = post.mediaLinks?.length ? `<section class="radar-sources" aria-label="Material visual oficial">
    <h2>Material visual oficial</h2>
    <ul>${post.mediaLinks.map(source => `<li><a href="${escape(source.url)}">${escape(source.label)}</a></li>`).join("")}</ul>
  </section>` : "";
  const facts = post.release || post.peru ? `<dl class="radar-facts">
      ${post.release ? `<div><dt>Lanzamiento anunciado</dt><dd>${monthText(post.release)} · ${escape(post.market)}</dd></div>` : ""}
      ${post.peru ? `<div><dt>En Perú</dt><dd>${escape(post.peru)}</dd></div>` : ""}
    </dl>` : "";
  return siteFrame({
    title: post.title, description: post.description, url: route(post), cover: post.cover, modules: ["radar-comunidad"],
    schema: {
      "@type": "Article", headline: post.title, description: post.description,
      image: [post.cover, ...(post.gallery || [])].map(imageUrl),
      datePublished: post.date, inLanguage: "es-PE", author: publisher, publisher,
      mainEntityOfPage: { "@type": "WebPage", "@id": SITE + route(post) }, about: "Saint Seiya",
      citation: post.sources.map(source => source.url),
    },
    content: `<main class="radar" id="contenido">
      <div class="radar-wrap radar-reading">
        <a class="radar-back" href="/radar/">← Volver al Radar</a>
        <article>
          <header class="radar-article-header">
            <p class="radar-label">${SECTIONS[post.category]} · ${escape(post.type)}</p>
            <h1>${escape(post.title)}</h1>
            <p class="radar-lead">${escape(post.description)}</p>
            <p class="radar-byline">Redacción BoomArt · <time datetime="${post.date}">${dateText(post.date)}</time>${post.announcementDate ? ` · Fuente fechada el <time datetime="${post.announcementDate}">${dateText(post.announcementDate)}</time>` : ""}</p>
          </header>
          ${facts}
          ${image}
          <div class="radar-prose">${post.paragraphs.map(paragraph => `<p>${escape(paragraph)}</p>`).join("\n          ")}</div>
          ${gallery}
          ${media}
          <section class="radar-sources" aria-labelledby="titulo-fuentes">
            <h2 id="titulo-fuentes">Fuentes</h2>
            <ul>${post.sources.map(source => `<li><a href="${escape(source.url)}">${escape(source.label)}</a></li>`).join("")}</ul>
          </section>
          <nav class="radar-share" aria-label="Compartir la nota">
            <strong>Compartir</strong>
            <a href="https://wa.me/?text=${encodeURIComponent(`${post.title} ${SITE + route(post)}`)}">WhatsApp</a>
            <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SITE + route(post))}">Facebook</a>
            <button class="radar-text-button" type="button" data-copy-link data-url="${SITE + route(post)}" hidden>Copiar enlace</button><span data-copy-status role="status"></span>
          </nav>
        </article>
        ${community(post)}
      </div>
    </main>`,
  });
}

function moderationPage() {
  return siteFrame({
    title: "Moderación del Radar", description: "Bandeja de moderación de Radar Saint Seiya Perú.",
    url: "/radar/moderacion/", privatePage: true, modules: ["radar-moderar"],
    content: `<main class="radar" id="contenido" data-radar-moderation>
      <div class="radar-wrap radar-reading">
        <a class="radar-back" href="/radar/">← Volver al Radar</a>
        <h1>Moderación del Radar</h1>
        <p data-preview class="radar-preview" hidden>Vista de prueba. Solo aparecen participaciones de este navegador.</p>
        <p data-session class="radar-session" hidden><button class="radar-text-button" type="button" data-sign-out>Cerrar sesión</button></p>
        <p data-status class="radar-feedback" role="status">Comprobando acceso…</p>
        ${loginForm()}
        <section data-queue hidden aria-label="Bandeja de moderación"></section>
      </div>
    </main>`,
  });
}

function rss(posts) {
  const items = posts.map(post => {
    const url = SITE + route(post);
    const date = new Date(`${post.date}T12:00:00-05:00`).toUTCString();
    return `    <item><title>${escape(post.title)}</title><link>${url}</link><guid>${url}</guid><description>${escape(post.description)}</description><pubDate>${date}</pubDate><category>${escape(SECTIONS[post.category])}</category></item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Radar Saint Seiya Perú</title>
    <link>${SITE}/radar/</link>
    <description>Novedades de Saint Seiya para coleccionistas de Perú.</description>
    <language>es-pe</language>
    <atom:link href="${SITE}/radar/feed.xml" rel="self" type="application/rss+xml"/>
${items.join("\n")}
  </channel>
</rss>
`;
}

export async function renderRadar(root, posts) {
  const pages = new Map([
    ["radar/index.html", homepage(posts)],
    ["radar/moderacion/index.html", moderationPage()],
    ["radar/feed.xml", rss(posts)],
    ...posts.map(post => [`radar/${post.slug}/index.html`, article(post)]),
  ]);
  await Promise.all([...pages].map(async ([relative, body]) => {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body.replace(/^[ \t]+$/gm, ""), "utf8");
  }));
}
