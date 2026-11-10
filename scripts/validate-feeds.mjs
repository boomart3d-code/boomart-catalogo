// Comprueba que el catalogo, las paginas, el sitemap y TODOS los feeds cuenten la
// misma historia: mismos productos, mismos precios, fotos y enlaces que existen.
// Ademas valida el feed de OpenAI contra su especificacion oficial
// (https://developers.openai.com/commerce/product-feeds/spec).
//
// Uso:  node scripts/validate-feeds.mjs      (sale con codigo 1 si hay errores)
// Solo lee archivos del repositorio; no usa red ni credenciales.

import { readFile, access, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://boomart.pe";
const rd = (f) => readFile(path.join(ROOT, f), "utf8");
const exists = (f) => access(path.join(ROOT, f)).then(() => true, () => false);
const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const EMOJI = /\p{Extended_Pictographic}/u;
const localPath = (url) => decodeURIComponent(url.replace(SITE + "/", "").split("?")[0]);

const products = JSON.parse(await rd("data/products.json"));
const ids = products.map((p) => p.id);

/* ---- 1. mismo numero de productos en todas partes */
const catalog = JSON.parse(await rd("catalogo.json"));
const google = await rd("feed-google.xml");
const metaCsv = (await rd("feed-meta.csv")).trim().split(/\r?\n/);
const sitemap = await rd("sitemap.xml");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const productDirs = (await readdir(path.join(ROOT, "producto"), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
const googleItems = [...google.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
const llms = await rd("llms.txt");
const llmsFull = await rd("llms-full.txt");

const counts = {
  "data/products.json": products.length,
  "catalogo.json (count)": catalog.count,
  "catalogo.json (products)": catalog.products.length,
  "feed-google.xml": googleItems.length,
  "feed-meta.csv": metaCsv.length - 1,
  "carpetas producto/": productDirs.length,
  "sitemap /producto/": sitemapUrls.filter((u) => u.startsWith(`${SITE}/producto/`)).length,
  "llms-full.txt": Number((llmsFull.match(/Total de piezas: (\d+)/) || [])[1]),
  "llms.txt": Number((llms.match(/las (\d+) piezas/) || [])[1]),
};
for (const [k, v] of Object.entries(counts)) if (v !== products.length) fail(`${k}: ${v} (se esperaban ${products.length})`);
if (new Set(ids).size !== ids.length) fail("Hay ids de producto repetidos");
for (const id of ids) if (!productDirs.includes(id)) fail(`Falta la pagina producto/${id}/`);
for (const d of productDirs) if (!ids.includes(d)) fail(`La carpeta producto/${d}/ no corresponde a ningun producto`);
if (new Set(sitemapUrls).size !== sitemapUrls.length) fail("El sitemap repite URLs");
for (const u of sitemapUrls) {
  const rel = u.slice(SITE.length + 1);
  const file = rel === "" ? "index.html" : rel.endsWith("/") ? `${rel}index.html` : rel;
  if (!(await exists(file))) fail(`El sitemap lista ${u} pero no existe ${file}`);
}
const lastmods = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
if (lastmods.length !== sitemapUrls.length) fail("Hay URLs del sitemap sin lastmod");
if (lastmods.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) fail("lastmod con formato invalido");

/* ---- 2. precio por opcion: JSON-LD de la ficha = feeds = catalogo */
const csvSplit = (line) => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map((m) => m[1].replace(/""/g, '"'));
const metaHeader = metaCsv[0].split(",");
const metaRows = new Map(metaCsv.slice(1).map((l) => { const r = csvSplit(l); return [r[metaHeader.indexOf("id")], r]; }));
const ldOffers = new Map();
for (const p of products) {
  const html = await rd(`producto/${p.id}/index.html`);
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((j) => j["@type"] === "Product");
  if (!ld) { fail(`${p.id}: la ficha no trae Product en JSON-LD`); continue; }
  const offers = [].concat(ld.offers || []);
  ldOffers.set(p.id, offers);
  if (!offers.length) fail(`${p.id}: sin ofertas`);
  const base = offers[0];
  const money = `${Number(base?.price).toFixed(2)} PEN`;
  const g = googleItems.find((i) => i.includes(`<g:id>${p.id}</g:id>`));
  if (!g) fail(`${p.id}: falta en feed-google.xml`);
  else if (g.match(/<g:price>(.*?)<\/g:price>/)[1] !== money) fail(`${p.id}: precio del feed de Google ${g.match(/<g:price>(.*?)<\/g:price>/)[1]} != ficha ${money}`);
  const m = metaRows.get(p.id);
  if (!m) fail(`${p.id}: falta en feed-meta.csv`);
  else if (m[metaHeader.indexOf("price")] !== money) fail(`${p.id}: precio del feed de Meta ${m[metaHeader.indexOf("price")]} != ficha ${money}`);
  const c = catalog.products.find((x) => x.id === p.id);
  if (!c) fail(`${p.id}: falta en catalogo.json`);
  if (html.includes('"AggregateOffer"')) fail(`${p.id}: la ficha todavia usa AggregateOffer`);
  // La ficha, los feeds y el catalogo usan la misma URL canonica
  if (g && g.match(/<g:link>(.*?)<\/g:link>/)[1] !== `${SITE}/producto/${p.id}/`) fail(`${p.id}: enlace del feed de Google distinto de la ficha`);
}

/* ---- 3. emoji fuera de lo que leen las maquinas */
for (const i of googleItems) if (EMOJI.test(i.match(/<g:title>(.*?)<\/g:title>/)[1])) fail(`feed-google: emoji en el titulo de ${i.match(/<g:id>(.*?)<\/g:id>/)[1]}`);
for (const [id, r] of metaRows) if (EMOJI.test(r[metaHeader.indexOf("title")])) fail(`feed-meta: emoji en el titulo de ${id}`);

/* ---- 4. feed de OpenAI (formato JSONL y CSV, mismas filas) */
const jsonl = (await rd("feed-openai.jsonl")).trim().split("\n").map((l) => JSON.parse(l));
const csvText = await rd("feed-openai.csv");
const parseCsv = (text) => {
  const rows = []; let row = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  return rows;
};
const csvRows = parseCsv(csvText);
const csvHeader = csvRows[0];
if (csvRows.length - 1 !== jsonl.length) fail(`feed-openai: CSV (${csvRows.length - 1}) y JSONL (${jsonl.length}) tienen distinto numero de filas`);

const REQUIRED = ["item_id", "title", "description", "url", "brand", "seller_name", "image_url", "availability", "price"];
const AVAILABILITY = ["in_stock", "out_of_stock", "pre_order", "backorder", "unknown"];
const itemIds = new Set();
const groups = new Map();
const webpRows = new Set();
for (const row of jsonl) {
  const where = `feed-openai ${row.item_id}`;
  for (const f of REQUIRED) if (row[f] === undefined || row[f] === null || row[f] === "") fail(`${where}: falta ${f}`);
  if (itemIds.has(row.item_id)) fail(`${where}: item_id repetido`);
  itemIds.add(row.item_id);
  if (!AVAILABILITY.includes(row.availability)) fail(`${where}: availability invalido (${row.availability})`);
  if (!/^\d+(\.\d+)? [A-Z]{3}$/.test(row.price) || !(parseFloat(row.price) > 0)) fail(`${where}: price invalido (${row.price})`);
  if (!row.price.endsWith(" PEN")) fail(`${where}: la moneda deberia ser PEN`);
  if ([...String(row.title)].length > 150) fail(`${where}: titulo de mas de 150 caracteres`);
  if ([...String(row.description)].length > 5000) fail(`${where}: descripcion de mas de 5000 caracteres`);
  if (EMOJI.test(row.title) || EMOJI.test(row.description)) fail(`${where}: emoji en titulo o descripcion`);
  if (!/^https:\/\//.test(row.url) || !/^https:\/\//.test(row.image_url)) fail(`${where}: url o image_url no es HTTPS absoluta`);
  for (const u of [row.image_url, ...(row.additional_image_urls || [])]) {
    if (!(await exists(localPath(u)))) fail(`${where}: la foto ${u} no existe en el repositorio`);
    if (/\.webp(\?|$)/i.test(u)) webpRows.add(row.item_id);
  }
  const page = localPath(row.url);
  if (!(await exists(`${page}index.html`))) fail(`${where}: la pagina ${row.url} no existe`);
  if (row.listing_has_variations) {
    if (!row.group_id || row.group_id === row.item_id) fail(`${where}: group_id vacio o igual a item_id`);
    if (!row.variant_dict || !Object.keys(row.variant_dict).length) fail(`${where}: variante sin variant_dict`);
    (groups.get(row.group_id) || groups.set(row.group_id, []).get(row.group_id)).push(row);
  }
  if (row.is_ads_eligible !== true) fail(`${where}: is_ads_eligible deberia ser true`);
  // coincide con el CSV, fila a fila
  const csvRow = csvRows.find((r) => r[csvHeader.indexOf("item_id")] === row.item_id);
  if (!csvRow) fail(`${where}: falta en feed-openai.csv`);
  else if (csvRow[csvHeader.indexOf("price")] !== row.price) fail(`${where}: precio distinto entre CSV y JSONL`);
}
for (const [g, rows] of groups) {
  if (rows.length < 2) fail(`feed-openai ${g}: un grupo de variantes con una sola fila`);
  const names = new Set(rows.map((r) => Object.keys(r.variant_dict).join("|")));
  if (names.size > 1) fail(`feed-openai ${g}: las variantes usan nombres de opcion distintos`);
  const opts = rows.map((r) => Object.values(r.variant_dict).join("|"));
  if (new Set(opts).size !== opts.length) fail(`feed-openai ${g}: opciones repetidas`);
}
// cada producto aparece y su opcion base (item_id = id) cuesta lo mismo que la ficha
for (const p of products) {
  const base = jsonl.find((r) => r.item_id === p.id);
  if (!base) { fail(`feed-openai: falta ${p.id}`); continue; }
  const offers = ldOffers.get(p.id) || [];
  if (offers.length && base.price !== `${Number(offers[0].price).toFixed(2)} PEN`) fail(`feed-openai ${p.id}: precio ${base.price} != ficha`);
  if (jsonl.filter((r) => r.url === `${SITE}/producto/${p.id}/`).length !== offers.length) fail(`feed-openai ${p.id}: ${jsonl.filter((r) => r.url === `${SITE}/producto/${p.id}/`).length} filas para ${offers.length} ofertas de la ficha`);
  // cada oferta de la ficha tiene su fila con el mismo SKU y precio
  for (const o of offers) {
    const r = jsonl.find((x) => x.item_id === o.sku);
    if (!r) fail(`feed-openai: falta la opcion ${o.sku}`);
    else if (r.price !== `${Number(o.price).toFixed(2)} PEN`) fail(`feed-openai ${o.sku}: precio ${r.price} != ficha ${o.price}`);
  }
}

/* ---- 5. avisos de datos (no frenan, pero hay que decidirlos) */
if (webpRows.size) warn(`${webpRows.size} filas de feed-openai llevan fotos .webp (la especificacion de OpenAI cita JPEG/PNG como ejemplos): ${[...webpRows].join(", ")}`);
for (const p of products) if (!p.availability) warn(`${p.id}: no tiene "availability" en data/products.json`);

console.log(JSON.stringify({ productos: products.length, filasOpenAI: jsonl.length, gruposDeVariantes: groups.size, urlsSitemap: sitemapUrls.length, errores: errors.length, avisos: warnings.length }, null, 2));
for (const w of warnings) console.log("AVISO:", w);
for (const e of errors) console.log("ERROR:", e);
if (errors.length) process.exitCode = 1;
