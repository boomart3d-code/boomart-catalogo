// Comprueba que el catalogo, las paginas, el sitemap y TODOS los feeds cuenten la
// misma historia: mismos productos, mismos precios, fotos y enlaces que existen.
// Ademas valida el feed de OpenAI contra su especificacion oficial
// (https://developers.openai.com/commerce/product-feeds/spec).
//
// Uso:  node scripts/validate-feeds.mjs      (sale con codigo 1 si hay errores)
// Solo lee archivos del repositorio; no usa red ni credenciales.

import { readFile, access, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkRows, checkAgainstCatalog, checkGroupsDoc, checkMeta, checkLocalLinks } from "./openai-feed-checks.mjs";

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

// Estructura de las filas (incompletas, duplicadas, mal formadas, sin etiqueta): modulo compartido
// con las pruebas, que demuestran con casos inventados que cada fallo se detecta.
const adsConfig = JSON.parse(await rd("data/ads-grupos.json"));
const temasConocidos = [...new Set(adsConfig.temaPrincipal.map((r) => r.tema))];
const structural = checkRows(jsonl, { temas: temasConocidos });
structural.errors.forEach(fail);
structural.warnings.forEach(warn);

// las fotos y la pagina de cada fila existen en el repositorio (enlaces rotos)
(await checkLocalLinks(jsonl, exists, { site: SITE })).errors.forEach(fail);
const webpRows = new Set();
for (const row of jsonl) {
  const where = `feed-openai ${row.item_id}`;
  for (const u of [row.image_url, ...(row.additional_image_urls || [])]) if (/\.webp(\?|$)/i.test(u)) webpRows.add(row.item_id);
  // coincide con el CSV, fila a fila
  const csvRow = csvRows.find((r) => r[csvHeader.indexOf("item_id")] === row.item_id);
  if (!csvRow) fail(`${where}: falta en feed-openai.csv`);
  else if (csvRow[csvHeader.indexOf("price")] !== row.price) fail(`${where}: precio distinto entre CSV y JSONL`);
  else if (csvRow[csvHeader.indexOf("product_category")] !== row.product_category) fail(`${where}: product_category distinta entre CSV y JSONL`);
  else if (csvRow[csvHeader.indexOf("ads_metadata")] !== JSON.stringify(row.ads_metadata ?? "")) fail(`${where}: ads_metadata distinta entre CSV y JSONL`);
}
const groups = new Map();
for (const r of jsonl) if (r.group_id) (groups.get(r.group_id) || groups.set(r.group_id, []).get(r.group_id)).push(r);

// Feed contra el catalogo: cada oferta de cada ficha tiene su fila con el mismo SKU y precio;
// no sobran filas de productos retirados.
const expected = new Map();
for (const p of products) {
  const offers = ldOffers.get(p.id) || [];
  if (!offers.length) fail(`feed-openai: la ficha de ${p.id} no tiene ofertas`);
  for (const o of offers) expected.set(o.sku, { price: `${Number(o.price).toFixed(2)} PEN` });
}
const drift = checkAgainstCatalog(jsonl, expected);
drift.errors.forEach(fail);

// Archivos auxiliares: grupos de campana y metadatos con la huella del feed
const sha = (s) => createHash("sha256").update(s).digest("hex");
const groupsDoc = JSON.parse(await rd("feed-openai-grupos.json"));
const groupsCheck = checkGroupsDoc(groupsDoc, jsonl);
groupsCheck.errors.forEach(fail);
groupsCheck.warnings.forEach(warn);
const metaCheck = checkMeta(JSON.parse(await rd("feed-openai.meta.json")), {
  rows: jsonl,
  jsonlSha: sha(await rd("feed-openai.jsonl")),
  csvSha: sha(csvText),
  products: products.length,
});
metaCheck.errors.forEach(fail);
metaCheck.warnings.forEach(warn);

/* ---- 5. avisos de datos (no frenan, pero hay que decidirlos) */
if (webpRows.size) warn(`${webpRows.size} filas de feed-openai llevan fotos .webp (la especificacion de OpenAI cita JPEG/PNG como ejemplos): ${[...webpRows].join(", ")}`);
for (const p of products) if (!p.availability) warn(`${p.id}: no tiene "availability" en data/products.json`);

console.log(JSON.stringify({ productos: products.length, filasOpenAI: jsonl.length, gruposDeVariantes: groups.size, urlsSitemap: sitemapUrls.length, errores: errors.length, avisos: warnings.length }, null, 2));
for (const w of warnings) console.log("AVISO:", w);
for (const e of errors) console.log("ERROR:", e);
if (errors.length) process.exitCode = 1;
