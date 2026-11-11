// Disponibilidad honesta y filtro por etiqueta del feed de ChatGPT Ads:  node --test scripts/ads-disponibilidad.test.mjs
//  - "A pedido" confirmado en data/products.json -> estado bajo pedido (backorder), con plazo en la descripcion.
//  - Sin disponibilidad confirmada (p. ej. belen-iluminado) -> unknown y FUERA de anuncios.
//  - Cada tematica trae su filtro ads_metadata.custom_label_0 listo para un grupo de anuncios.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAdsConfig, openAiAvailability, OPENAI_AVAILABILITY } from "./ads-taxonomy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (f) => readFile(path.join(ROOT, f), "utf8");
const CFG = JSON.parse(await rd("data/ads-grupos.json"));
const PRODUCTS = JSON.parse(await rd("data/products.json"));

test("los estados validos son los cinco de la especificacion oficial de OpenAI", () => {
  assert.deepEqual(OPENAI_AVAILABILITY, ["in_stock", "out_of_stock", "pre_order", "backorder", "unknown"]);
});

test("la configuracion real declara bajo pedido como backorder y lo no confirmado como unknown", () => {
  assert.equal(CFG.disponibilidad.bajoPedido, "backorder");
  assert.equal(CFG.disponibilidad.sinDato, "unknown");
  assert.deepEqual(validateAdsConfig(CFG), []);
});

test("la validacion detecta estados de disponibilidad invalidos o ambiguos", () => {
  const bad = (mut) => { const c = structuredClone(CFG); mut(c); return validateAdsConfig(c).join("\n"); };
  assert.match(bad((c) => { c.disponibilidad.bajoPedido = "a_pedido"; }), /disponibilidad\.bajoPedido debe ser uno de/);
  assert.match(bad((c) => { c.disponibilidad.sinDato = "disponible"; }), /disponibilidad\.sinDato debe ser uno de/);
  assert.match(bad((c) => { c.disponibilidad.sinDato = c.disponibilidad.bajoPedido; }), /no puede ser igual/);
  assert.match(bad((c) => { delete c.disponibilidad; }), /Falta "disponibilidad"/);
});

test("solo se declara bajo pedido si availability 'A pedido' esta confirmada", () => {
  const a = (availability) => openAiAvailability({ id: "x", availability }, CFG);
  assert.deepEqual(a("A pedido"), { estado: "backorder", confirmada: true });
  assert.deepEqual(a("  a PEDIDO "), { estado: "backorder", confirmada: true });
  assert.deepEqual(a(undefined), { estado: "unknown", confirmada: false });
  assert.deepEqual(a(""), { estado: "unknown", confirmada: false });
  // un texto que no es 'A pedido' (p. ej. 'En stock') NO se toma como existencias confirmadas
  assert.deepEqual(a("En stock"), { estado: "unknown", confirmada: false });
  // si Adrian prefiere in_stock, es un cambio de una linea
  const c2 = structuredClone(CFG); c2.disponibilidad.bajoPedido = "in_stock";
  assert.equal(openAiAvailability({ id: "x", availability: "A pedido" }, c2).estado, "in_stock");
});

test("en el feed real: belen-iluminado es unknown y no entra a anuncios; el resto es backorder y elegible", async () => {
  const rows = (await rd("feed-openai.jsonl")).trim().split("\n").map((l) => JSON.parse(l));
  const sinDato = PRODUCTS.filter((p) => !p.availability).map((p) => p.id);
  assert.deepEqual(sinDato, ["belen-iluminado"], "cambio la lista de productos sin disponibilidad confirmada");
  for (const r of rows) {
    const id = String(r.url).split("/").filter(Boolean).pop();
    if (sinDato.includes(id)) {
      assert.equal(r.availability, "unknown", r.item_id);
      assert.equal(r.is_ads_eligible, false, r.item_id);
    } else {
      assert.equal(r.availability, "backorder", r.item_id);
      assert.equal(r.is_ads_eligible, true, r.item_id);
      assert.match(r.description, /fabricado bajo pedido/i, r.item_id);
    }
  }
  const meta = JSON.parse(await rd("feed-openai.meta.json"));
  assert.deepEqual(meta.filasPorDisponibilidad, { backorder: rows.length - 1, unknown: 1 });
  assert.equal(meta.filasElegiblesParaAnuncios, rows.length - 1);
});

test("Google, Meta y los datos estructurados de las fichas NO cambian de estado (siguen como estaban)", async () => {
  assert.ok((await rd("feed-google.xml")).includes("<g:availability>in_stock</g:availability>"));
  assert.ok(!(await rd("feed-google.xml")).includes("backorder"));
  const ficha = await rd("producto/templo-aries/index.html");
  assert.ok(ficha.includes('"availability":"https://schema.org/InStock"'));
});

test("cada tematica trae su filtro ads_metadata.custom_label_0 y coincide con el feed", async () => {
  const groups = JSON.parse(await rd("feed-openai-grupos.json"));
  const rows = (await rd("feed-openai.jsonl")).trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(groups.temas.length >= 7);
  for (const t of groups.temas) {
    assert.deepEqual(t.filtroEtiqueta, { field: "ads_metadata.custom_label_0", operator: "in", values: [t.tema] });
    const conEtiqueta = new Set(rows.filter((r) => r.ads_metadata.custom_label_0 === t.tema).map((r) => String(r.url).split("/").filter(Boolean).pop()));
    assert.equal(conEtiqueta.size, t.productos, `tema ${t.tema}`);
  }
});
