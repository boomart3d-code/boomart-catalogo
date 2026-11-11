// Coherencia de los plazos de fabricacion bajo pedido:  node --test scripts/plazos.test.mjs
// data/plazos-fabricacion.json es la unica fuente; estas pruebas comprueban que la ficha de cada producto,
// la politica de compra, el catalogo y los tres feeds (Google, Meta y OpenAI) digan lo mismo y que no
// quede ningun "48 horas utiles" viejo.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePlazos, plazoOf } from "./plazos.mjs";
import { parseDelimited } from "./openai-feed-checks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (f) => readFile(path.join(ROOT, f), "utf8");
const CFG = JSON.parse(await rd("data/plazos-fabricacion.json"));
const PRODUCTS = JSON.parse(await rd("data/products.json"));
const base = (p) => (p.templePricing ? (p.templePricing.combo ?? p.templePricing.temple) : p.signPicker ? p.signPicker.unitPrice : p.modelOptions ? p.modelOptions[0].regularPrice : p.regularPrice);
const expected = (p) => plazoOf(p, CFG, base(p));
const SENCILLO = "24 a 48 horas";
const ELABORADO = "3 a 5 días";
const prod = (over) => ({ id: "x", tags: [], regularPrice: 100, ...over });

test("las cifras de referencia de Adrian estan en la configuracion", () => {
  assert.equal(CFG.niveles.sencillo.texto, SENCILLO);
  assert.equal(CFG.niveles.elaborado.texto, ELABORADO);
});

test("la configuracion real esta bien escrita y la validacion detecta errores de escritura", () => {
  assert.deepEqual(validatePlazos(CFG), []);
  const bad = (mut) => { const c = structuredClone(CFG); mut(c); return validatePlazos(c).join("\n"); };
  assert.match(bad((c) => { delete c.niveles.elaborado; }), /Falta el nivel "elaborado"/);
  assert.match(bad((c) => { c.niveles.sencillo.texto = ""; }), /falta "texto"/);
  assert.match(bad((c) => { c.nivelPorDefecto = "rapido"; }), /nivelPorDefecto/);
  assert.match(bad((c) => { c.reglaElaborado.precio = 5; }), /condicion desconocida "precio"/);
  assert.match(bad((c) => { c.reglaElaborado.idPatron = "("; }), /expresion regular/);
  assert.match(bad((c) => { c.forzarElaborado = [c.forzarSencillo[0]]; }), /a la vez/);
  assert.match(bad((c) => { c.forzarSencillo = "x"; }), /debe ser una lista/);
});

test("clasificacion: por precio, por etiqueta, por id y con forzados que mandan sobre la regla", () => {
  assert.equal(expected(prod({ regularPrice: 149 })).nivel, "sencillo");
  assert.equal(expected(prod({ regularPrice: 150 })).nivel, "elaborado");
  assert.equal(expected(prod({ tags: ["Tamaño real"] })).nivel, "elaborado");
  assert.equal(expected(prod({ tags: ["TAMANO REAL"] })).nivel, "elaborado"); // sin tildes ni mayusculas
  assert.equal(expected(prod({ tags: ["Combo"] })).nivel, "elaborado");
  assert.equal(expected(prod({ id: "set-algo" })).nivel, "elaborado");
  assert.equal(expected(prod({ id: "x", regularPrice: 20 })).texto, SENCILLO);
  assert.equal(expected(prod({ id: "set-santuario-15-piezas", regularPrice: 150 })).nivel, "sencillo"); // forzado
  assert.equal(expected(prod({ id: "set-santuario-15-piezas", regularPrice: 150 })).porRegla, false);
  const c = structuredClone(CFG); c.forzarElaborado = ["barato"];
  assert.equal(plazoOf(prod({ id: "barato", regularPrice: 10 }), c, 10).nivel, "elaborado");
});

test("los dos niveles se usan en el catalogo real", () => {
  const n = { sencillo: 0, elaborado: 0 };
  for (const p of PRODUCTS) n[expected(p).nivel]++;
  assert.ok(n.sencillo > 0 && n.elaborado > 0, JSON.stringify(n));
  assert.equal(n.sencillo + n.elaborado, PRODUCTS.length);
});

test("catalogo.json, catalogo.html y llms-full.txt muestran el plazo de cada producto", async () => {
  const catalog = JSON.parse(await rd("catalogo.json"));
  const html = await rd("catalogo.html");
  const llms = await rd("llms-full.txt");
  for (const p of PRODUCTS) {
    const e = expected(p);
    const c = catalog.products.find((x) => x.id === p.id);
    assert.equal(c.fabricacion.texto, e.texto, p.id);
    assert.equal(c.fabricacion.nivel, e.nivel, p.id);
  }
  // los textos generales de catalogo.html y llms-full.txt traen los dos plazos
  for (const t of [html, llms]) {
    assert.ok(t.includes(SENCILLO) && t.includes(ELABORADO));
    assert.ok(!/48 horas utiles|~48/.test(t.replace(/Produccion de 24 a 48 horas utiles/g, "")), "queda un 48 horas viejo");
  }
  assert.equal((llms.match(/- Fabricación bajo pedido: /g) || []).length, llms.match(/^### /gm).length);
});

test("cada ficha de producto dice su plazo y la condicion de hecho a pedido, sin stock", async () => {
  for (const p of PRODUCTS) {
    const html = await rd(`producto/${p.id}/index.html`);
    const e = expected(p);
    assert.ok(html.includes(`La fabricación toma aproximadamente <strong>${e.texto}</strong> desde que confirmas tu compra`), `${p.id}: plazo de la ficha`);
    assert.ok(html.includes("Cada pieza se produce a pedido") && html.includes("No trabajamos con stock"), `${p.id}: condicion bajo pedido`);
    // la frase propia de la descripcion ("Produccion de 24 a 48 horas utiles") es del producto y se valida aparte
    assert.ok(!/48 horas útiles/.test(html.replace(/24 a 48 horas útiles/g, "")), `${p.id}: queda "48 horas útiles"`);
  }
});

test("los feeds de Google, Meta y OpenAI usan el mismo plazo que la ficha", async () => {
  const google = await rd("feed-google.xml");
  for (const item of google.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const id = item[1].match(/<g:id>(.*?)<\/g:id>/)[1];
    const e = expected(PRODUCTS.find((p) => p.id === id));
    assert.ok(item[1].includes(`Fabricacion: ${e.texto}.`), `google ${id}`);
    assert.ok(!/Produccion ~|48 h utiles/.test(item[1]), `google ${id}: texto viejo`);
  }
  const meta = parseDelimited(await rd("feed-meta.csv"), ",");
  const di = meta[0].indexOf("description");
  for (const r of meta.slice(1)) {
    const e = expected(PRODUCTS.find((p) => p.id === r[meta[0].indexOf("id")]));
    assert.ok(r[di].includes(`Fabricacion: ${e.texto}.`), `meta ${r[0]}`);
    assert.ok(!/Produccion ~|48 h utiles/.test(r[di]), `meta ${r[0]}: texto viejo`);
  }
  const rows = (await rd("feed-openai.jsonl")).trim().split("\n").map((l) => JSON.parse(l));
  for (const r of rows) {
    const id = String(r.url).split("/").filter(Boolean).pop();
    const p = PRODUCTS.find((x) => x.id === id);
    if (r.availability === "unknown") {
      assert.ok(!/fabricado bajo pedido:/i.test(r.description), `${r.item_id}: sin disponibilidad confirmada no se declara plazo`);
      continue;
    }
    assert.ok(r.description.startsWith(`Producto fabricado bajo pedido: ${expected(p).texto} de fabricación. `), `openai ${r.item_id}`);
  }
});

test("la politica de compra (politicas.html) trae los dos plazos y ya no dice 48 horas utiles", async () => {
  const t = await rd("politicas.html");
  assert.ok(t.includes(`<strong>${SENCILLO}</strong>`) && t.includes(`<strong>${ELABORADO}</strong>`));
  assert.ok(!/48 horas útiles/.test(t));
  // el unico "48 horas" que queda es el plazo para reclamar un daño de transporte (otra cosa)
  assert.ok(/Daño ocurrido durante el transporte:<\/strong> hasta <strong>48 horas<\/strong>/.test(t));
});

test("lo que una descripcion afirma sobre su propio plazo no contradice el nivel asignado", () => {
  for (const p of PRODUCTS) {
    const d = String(p.description || "");
    if (/24 a 48 horas/.test(d)) assert.equal(expected(p).nivel, "sencillo", `${p.id}: su descripcion dice 24 a 48 horas`);
    if (/3 a 5 d[ií]as/.test(d)) assert.equal(expected(p).nivel, "elaborado", `${p.id}: su descripcion dice 3 a 5 dias`);
  }
});
