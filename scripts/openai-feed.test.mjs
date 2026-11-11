// Pruebas del feed de ChatGPT Ads:  node --test scripts/openai-feed.test.mjs
// Los casos "malos" estan inventados para demostrar que cada tipo de fallo se detecta:
// productos incompletos, duplicados, desactualizados, retirados, con enlaces rotos, grupos
// huerfanos o rastreadores bloqueados. Al final se prueban los archivos reales del repositorio.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkRows, checkAgainstCatalog, checkGroupsDoc, checkMeta, checkLocalLinks,
} from "./openai-feed-checks.mjs";
import { validateAdsConfig, classifyProduct, groupsOf, buildGroupsDoc, norm } from "./ads-taxonomy.mjs";
import { parseRobots, robotsAllows } from "./robots-check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (f) => readFile(path.join(ROOT, f), "utf8");
const sha = (s) => createHash("sha256").update(s).digest("hex");
const TEMAS = ["anime", "gaming", "cosplay", "decoracion", "cine-y-series", "coleccionables", "deportes"];

// Una fila valida de referencia; cada prueba la estropea de una manera.
const good = (over = {}) => ({
  item_id: "templo-aries",
  title: "Templo de Aries",
  description: "Templo de la Casa de Aries impreso en 3D a pedido, con acabado artesanal tipo piedra envejecida.",
  url: "https://boomart.pe/producto/templo-aries/",
  brand: "BoomArt",
  seller_name: "BoomArt",
  image_url: "https://boomart.pe/assets/products/templo-aries.jpg",
  availability: "in_stock",
  price: "100.00 PEN",
  condition: "new",
  product_category: "Anime > Saint Seiya > Templos del Zodiaco",
  is_eligible_search: true,
  is_ads_eligible: true,
  ads_metadata: { custom_label_0: "anime" },
  ...over,
});
const second = (over = {}) => good({
  item_id: "templo-tauro", title: "Templo de Tauro", url: "https://boomart.pe/producto/templo-tauro/",
  image_url: "https://boomart.pe/assets/products/templo-tauro.jpg", ...over,
});
const errorsOf = (rows) => checkRows(rows, { temas: TEMAS }).errors;
const warningsOf = (rows) => checkRows(rows, { temas: TEMAS }).warnings;

/* ------------------------------------------------------------ filas incompletas, duplicadas o mal formadas */
test("una fila correcta no da errores", () => {
  assert.deepEqual(errorsOf([good(), second()]), []);
});

test("detecta productos INCOMPLETOS: cada campo obligatorio", () => {
  for (const f of ["item_id", "title", "description", "url", "brand", "seller_name", "image_url", "availability", "price"]) {
    const row = good({ [f]: "" });
    assert.match(errorsOf([row, second()]).join("\n"), new RegExp(`falta ${f}`), f);
  }
});

test("detecta item_id y titulos DUPLICADOS", () => {
  assert.match(errorsOf([good(), good()]).join("\n"), /item_id repetido/);
  assert.match(errorsOf([good(), second({ title: "TEMPLO de aries" })]).join("\n"), /titulo duplicado/);
});

test("detecta precio, moneda y disponibilidad invalidos", () => {
  assert.match(errorsOf([good({ price: "100 USD" })]).join("\n"), /deberia ser PEN/);
  assert.match(errorsOf([good({ price: "0.00 PEN" })]).join("\n"), /price invalido/);
  assert.match(errorsOf([good({ price: "1,000.00 PEN" })]).join("\n"), /price invalido/);
  assert.match(errorsOf([good({ price: "S/100" })]).join("\n"), /price invalido/);
  assert.match(errorsOf([good({ availability: "A pedido" })]).join("\n"), /availability invalido/);
});

test("detecta enlaces que no son HTTPS validos y texto con emoji o demasiado largo", () => {
  assert.match(errorsOf([good({ url: "http://boomart.pe/producto/templo-aries/" })]).join("\n"), /url no es una direccion HTTPS/);
  assert.match(errorsOf([good({ image_url: "/assets/foto.jpg" })]).join("\n"), /image_url no es una direccion HTTPS/);
  assert.match(errorsOf([good({ title: "Templo de Aries 🔥" })]).join("\n"), /emoji/);
  assert.match(errorsOf([good({ title: "x".repeat(151) })]).join("\n"), /mas de 150/);
  assert.match(errorsOf([good({ title: "templo-aries" })]).join("\n"), /igual al identificador/);
});

test("detecta variantes mal armadas", () => {
  const v = (id, opt, over = {}) => good({ item_id: id, title: `Templo ${opt}`, group_id: "grupo-aries", listing_has_variations: true, variant_dict: { Opcion: opt }, ...over });
  assert.deepEqual(errorsOf([v("a", "solo"), v("a-combo", "combo")]), []);
  assert.match(errorsOf([v("a", "solo")]).join("\n"), /una sola fila/);
  assert.match(errorsOf([v("a", "solo"), v("a-2", "solo")]).join("\n"), /opciones repetidas/);
  assert.match(errorsOf([v("a", "solo", { group_id: "a" }), v("a-2", "combo")]).join("\n"), /group_id vacio o igual a item_id/);
  assert.match(errorsOf([v("a", "solo", { variant_dict: {} }), v("a-2", "combo")]).join("\n"), /sin variant_dict/);
  assert.match(errorsOf([v("a", "solo"), v("a-2", "combo", { variant_dict: { Talla: "M" } })]).join("\n"), /nombres de opcion distintos/);
});

test("detecta productos sin etiqueta o con etiquetas que OpenAI no documenta", () => {
  assert.match(errorsOf([good({ ads_metadata: undefined })]).join("\n"), /no tiene ads_metadata.custom_label_0/);
  assert.match(errorsOf([good({ ads_metadata: { custom_label_0: "ropa" } })]).join("\n"), /no es una tematica conocida/);
  assert.match(errorsOf([good({ ads_metadata: { custom_label_0: "anime", custom_label_1: "x" } })]).join("\n"), /no documenta/);
  // un producto excluido de anuncios no necesita etiqueta
  assert.deepEqual(errorsOf([good({ is_ads_eligible: false, ads_metadata: undefined })]), []);
});

test("avisa si todas las filas comparten la misma categoria (no sirve para campanas) o repiten la foto", () => {
  const many = Array.from({ length: 12 }, (_, i) => good({ item_id: `p${i}`, title: `Producto ${i}`, url: `https://boomart.pe/producto/p${i}/`, image_url: `https://boomart.pe/a/${i}.jpg`, product_category: "Coleccionables" }));
  assert.match(warningsOf(many).join("\n"), /no sirve para armar grupos/);
  assert.match(warningsOf([good(), second({ image_url: good().image_url })]).join("\n"), /misma foto principal/);
});

/* ------------------------------------------------------------ desactualizado frente al catalogo */
test("detecta precios DESACTUALIZADOS, productos que faltan y productos RETIRADOS", () => {
  const expected = new Map([["templo-aries", { price: "100.00 PEN" }], ["templo-tauro", { price: "100.00 PEN" }]]);
  assert.deepEqual(checkAgainstCatalog([good(), second()], expected).errors, []);
  assert.match(checkAgainstCatalog([good({ price: "90.00 PEN" }), second()], expected).errors.join("\n"), /desactualizado.*100.00 PEN/);
  assert.match(checkAgainstCatalog([good()], expected).errors.join("\n"), /falta templo-tauro/);
  assert.match(checkAgainstCatalog([good(), second(), second({ item_id: "viejo", title: "Viejo" })], expected).errors.join("\n"), /viejo.*retirado/);
});

/* ------------------------------------------------------------ enlaces rotos */
test("detecta enlaces ROTOS: pagina o foto inexistente y direcciones de otro sitio", async () => {
  const present = new Set(["producto/templo-aries/index.html", "assets/products/templo-aries.jpg"]);
  const exists = async (p) => present.has(p);
  assert.deepEqual((await checkLocalLinks([good()], exists)).errors, []);
  assert.match((await checkLocalLinks([second()], exists)).errors.join("\n"), /la pagina .* no existe/);
  assert.match((await checkLocalLinks([good({ image_url: "https://boomart.pe/assets/products/borrada.jpg" })], exists)).errors.join("\n"), /la foto .* no existe/);
  assert.match((await checkLocalLinks([good({ url: "https://otro-sitio.com/x/" })], exists)).errors.join("\n"), /no es del sitio/);
});

/* ------------------------------------------------------------ grupos y metadatos */
test("el archivo de grupos detecta huerfanos, grupos vacios y perdida del aviso", () => {
  const rows = [good(), second()];
  const doc = () => ({
    aviso: "Coincidir NO garantiza impresiones",
    sinGrupo: [], sinTema: [],
    grupos: [{ id: "anime", filtroItemId: { values: ["templo-aries", "templo-tauro"] } }],
    categorias: [{ product_category: good().product_category, item_ids: ["templo-aries", "templo-tauro"] }],
  });
  assert.deepEqual(checkGroupsDoc(doc(), rows).errors, []);
  const d1 = doc(); d1.sinGrupo = ["x"];
  assert.match(checkGroupsDoc(d1, rows).errors.join("\n"), /ningun grupo/);
  const d2 = doc(); d2.grupos[0].filtroItemId.values = [];
  assert.match(checkGroupsDoc(d2, rows).errors.join("\n"), /esta vacio/);
  const d3 = doc(); d3.grupos[0].filtroItemId.values.push("fantasma");
  assert.match(checkGroupsDoc(d3, rows).errors.join("\n"), /fantasma no existe/);
  const d4 = doc(); d4.aviso = "Los mejores productos";
  assert.match(checkGroupsDoc(d4, rows).errors.join("\n"), /perdio el aviso/);
  const d5 = doc(); d5.categorias[0].product_category = "Otra > Cosa";
  assert.match(checkGroupsDoc(d5, rows).errors.join("\n"), /distinta de la del archivo de grupos/);
});

test("los metadatos detectan un feed editado a mano o desactualizado", () => {
  const rows = [good(), second()];
  const meta = { sha256Jsonl: "a", sha256Csv: "b", filas: 2, productos: 2, moneda: "PEN", generadoEl: "2026-11-10" };
  const ok = { rows, jsonlSha: "a", csvSha: "b", products: 2, now: new Date("2026-11-11T00:00:00Z") };
  assert.deepEqual(checkMeta(meta, ok).errors, []);
  assert.match(checkMeta(meta, { ...ok, jsonlSha: "z" }).errors.join("\n"), /huella del JSONL/);
  assert.match(checkMeta(meta, { ...ok, csvSha: "z" }).errors.join("\n"), /huella del CSV/);
  assert.match(checkMeta({ ...meta, filas: 5 }, ok).errors.join("\n"), /dice 5 filas/);
  assert.match(checkMeta(meta, { ...ok, products: 3 }).errors.join("\n"), /dice 2 productos/);
  assert.match(checkMeta({ ...meta, generadoEl: "2027-01-01" }, ok).errors.join("\n"), /en el futuro/);
  assert.match(checkMeta(null, ok).errors.join("\n"), /falta feed-openai.meta.json/);
});

/* ------------------------------------------------------------ reglas de tematica y grupos */
const CFG = JSON.parse(await rd("data/ads-grupos.json"));
const prod = (over) => ({ id: "x", name: "X", category: "Saint Seiya", tags: [], regularPrice: 150, ...over });

test("la configuracion real de grupos esta bien escrita y la validacion detecta errores de escritura", () => {
  assert.deepEqual(validateAdsConfig(CFG), []);
  const bad = (mut) => { const c = structuredClone(CFG); mut(c); return validateAdsConfig(c).join("\n"); };
  assert.match(bad((c) => { c.temaPrincipal[0].categoria = ["Saint Seiya"]; }), /condicion desconocida "categoria"/);
  assert.match(bad((c) => { c.grupos[0].reglas = [{}]; }), /no tiene ninguna condicion/);
  assert.match(bad((c) => { c.grupos[1].id = c.grupos[0].id; }), /id repetido/);
  assert.match(bad((c) => { c.grupos[0].reglas = [{ idPatron: "(" }]; }), /expresion regular/);
  assert.match(bad((c) => { c.grupos[0].reglas = [{ precioMax: -5 }]; }), /precioMax/);
  assert.match(bad((c) => { c.temaPrincipal[0].etiquetas = []; }), /lista de textos no vacia/);
  assert.match(bad((c) => { c.temaPrincipal[0].tema = "Anime Total"; }), /minusculas/);
});

test("clasifica: gana la primera regla, sin importar tildes ni mayusculas", () => {
  assert.deepEqual(classifyProduct(prod({ tags: ["Cascos"] }), CFG).ruta, ["Anime", "Saint Seiya", "Cascos y tiaras"]);
  // un templo que tambien lleva "Cajas De Pandora" cae en Templos (regla anterior)
  assert.deepEqual(classifyProduct(prod({ tags: ["Cajas De Pandora", "Templos"] }), CFG).ruta.at(-1), "Templos del Zodiaco");
  // Zelda es gaming aunque lleve la etiqueta Cosplay
  assert.equal(classifyProduct(prod({ category: "Zelda", tags: ["Cosplay"] }), CFG).tema, "gaming");
  // etiqueta sin tilde coincide con la tildada
  assert.equal(classifyProduct(prod({ category: "🎃 Halloween", tags: ["MÁSCARAS"] }), CFG).ruta.at(-1), "Mascaras");
  assert.equal(classifyProduct(prod({ category: "🎃 Halloween", tags: ["Portavelas", "Decoración"] }), CFG).tema, "decoracion");
  assert.equal(norm("Máscaras "), "mascaras");
});

test("un producto que ninguna regla reconoce cae en la tematica por defecto y se hace visible", () => {
  const c = classifyProduct(prod({ category: "Categoria nueva", tags: ["Raro"] }), CFG);
  assert.equal(c.tema, "otros");
  assert.equal(c.porDefecto, true);
  const doc = buildGroupsDoc({ products: [prod({ id: "nuevo", category: "Categoria nueva", tags: ["Raro"], regularPrice: 500 })], rows: [{ item_id: "nuevo", url: "https://boomart.pe/producto/nuevo/" }], cfg: CFG, priceOf: () => 500, date: "2026-11-11" });
  assert.deepEqual(doc.sinTema, ["nuevo"]);
  assert.deepEqual(doc.sinGrupo, ["nuevo"]);
  assert.match(checkGroupsDoc({ ...doc, grupos: doc.grupos.map((g) => ({ ...g, filtroItemId: { values: ["nuevo"] } })) }, [good({ item_id: "nuevo", product_category: doc.categorias[0].product_category })]).errors.join("\n"), /sin tematica/);
});

test("un producto puede estar en varios grupos y 'regalos' respeta el umbral de precio", () => {
  const temple = prod({ id: "templo-x", tags: ["Templo", "Combo"] });
  const c = classifyProduct(temple, CFG);
  const barato = groupsOf(temple, CFG, { tema: c.tema, price: 100 });
  assert.ok(["anime", "decoracion", "coleccionables", "regalos"].every((g) => barato.includes(g)), barato.join());
  const caro = groupsOf(temple, CFG, { tema: c.tema, price: 101 });
  assert.ok(!caro.includes("regalos"));
  // toda la categoria Navidad es regalo y temporada aunque cueste mas
  const navidad = prod({ category: "Navidad", tags: ["Navidad"] });
  const g = groupsOf(navidad, CFG, { tema: "decoracion", price: 220 });
  assert.ok(g.includes("regalos") && g.includes("temporada-navidad"));
});

/* ------------------------------------------------------------ rastreadores de OpenAI */
test("robots.txt: reglas de grupo, regla mas larga, comodines y vacio", () => {
  const txt = "User-agent: *\nDisallow: /privado/\nAllow: /privado/publico/\n\nUser-agent: OAI-AdsBot\nUser-agent: OAI-SearchBot\nDisallow: /admin/\n\nUser-agent: malo\nDisallow: /\n";
  assert.equal(robotsAllows(txt, "OAI-AdsBot", "/producto/x/"), true);
  assert.equal(robotsAllows(txt, "OAI-AdsBot", "/admin/"), false);
  // el grupo propio REEMPLAZA al comodin: aqui /privado/ queda permitido para OAI-AdsBot
  assert.equal(robotsAllows(txt, "OAI-AdsBot", "/privado/x"), true);
  assert.equal(robotsAllows(txt, "Otro", "/privado/x"), false);
  assert.equal(robotsAllows(txt, "Otro", "/privado/publico/x"), true);
  assert.equal(robotsAllows(txt, "malo", "/cualquier"), false);
  assert.equal(robotsAllows("User-agent: *\nDisallow:\n", "x", "/todo"), true);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /*.pdf$\n", "x", "/a.pdf"), false);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /*.pdf$\n", "x", "/a.pdf?v=1"), true);
  assert.equal(parseRobots("User-agent: a\nUser-agent: b\nDisallow: /x").length, 1);
});

test("el robots.txt REAL permite a OAI-AdsBot y OAI-SearchBot todo lo que el feed usa y protege lo privado", async () => {
  const robots = await rd("robots.txt");
  const rows = (await rd("feed-openai.jsonl")).trim().split("\n").map((l) => JSON.parse(l));
  const paths = [...new Set(rows.flatMap((r) => [r.url, r.image_url, ...(r.additional_image_urls || [])]))].map((u) => new URL(u).pathname);
  paths.push("/feed-openai.jsonl", "/feed-openai.csv", "/feed-openai.meta.json", "/feed-openai-grupos.json", "/sitemap.xml");
  for (const bot of ["OAI-AdsBot", "OAI-SearchBot"]) {
    const blocked = paths.filter((p) => !robotsAllows(robots, bot, p));
    assert.deepEqual(blocked, [], `${bot} bloqueado en ${blocked.slice(0, 3)}`);
    assert.equal(robotsAllows(robots, bot, "/admin/"), false);
    assert.equal(robotsAllows(robots, bot, "/panel/"), false);
  }
});

/* ------------------------------------------------------------ los archivos reales del repositorio */
test("el feed REAL pasa todas las comprobaciones y es coherente con sus grupos y su huella", async () => {
  const products = JSON.parse(await rd("data/products.json"));
  const jsonlText = await rd("feed-openai.jsonl");
  const csvText = await rd("feed-openai.csv");
  const rows = jsonlText.trim().split("\n").map((l) => JSON.parse(l));
  const temas = [...new Set(CFG.temaPrincipal.map((r) => r.tema))];
  const r = checkRows(rows, { temas });
  assert.deepEqual(r.errors, []);
  const groups = JSON.parse(await rd("feed-openai-grupos.json"));
  assert.deepEqual(checkGroupsDoc(groups, rows).errors, []);
  assert.deepEqual(checkMeta(JSON.parse(await rd("feed-openai.meta.json")), { rows, jsonlSha: sha(jsonlText), csvSha: sha(csvText), products: products.length }).errors, []);
  // cada producto del catalogo tiene al menos una fila, y ninguna fila es de un producto retirado
  const ids = new Set(products.map((p) => p.id));
  for (const p of products) assert.ok(rows.some((x) => x.item_id === p.id), `falta ${p.id}`);
  for (const x of rows) assert.ok(ids.has(String(x.url).split("/").filter(Boolean).pop()), `fila de producto retirado ${x.item_id}`);
  // las fotos y paginas existen
  const exists = (p) => access(path.join(ROOT, p)).then(() => true, () => false);
  assert.deepEqual((await checkLocalLinks(rows, exists)).errors, []);
  // la categoria del feed sirve para armar grupos
  assert.ok(new Set(rows.map((x) => x.product_category)).size >= 10);
});
