// Pruebas de la importacion por URL alojada y del control del procesamiento en OpenAI:
//   node --test scripts/openai-hosted.test.mjs
// Casos inventados (para demostrar que cada fallo se detecta) + los archivos reales del repositorio +
// el monitor de procesamiento contra un servidor FALSO que imita la API (no se usa la API real).

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkRows, parseDelimited, checkTxtMatchesCsv, checkHostedFile, REQUIRED } from "./openai-feed-checks.mjs";
import { evaluateUploads, uploadStamp } from "./openai-processing.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (f) => readFile(path.join(ROOT, f), "utf8");
const TEMAS = ["anime", "gaming", "cosplay", "decoracion", "cine-y-series", "coleccionables", "deportes"];
const NOW = Date.parse("2026-11-12T12:00:00Z");
const daysAgo = (d) => new Date(NOW - d * 864e5).toISOString();

/* ------------------------------------------------------------ disponibilidad honesta en las filas */
const row = (over = {}) => ({
  item_id: "maceta-pikachu",
  title: "Maceta de Pikachu",
  description: "Producto fabricado bajo pedido: 24 a 48 horas de fabricación. Maceta decorativa de Pikachu impresa en 3D. Envíos a todo el Perú.",
  url: "https://boomart.pe/producto/maceta-pikachu/",
  brand: "BoomArt",
  seller_name: "BoomArt",
  image_url: "https://boomart.pe/assets/products/maceta-pikachu.jpg",
  availability: "backorder",
  price: "60.00 PEN",
  condition: "new",
  product_category: "Decoracion > Macetas",
  is_eligible_search: true,
  is_ads_eligible: true,
  ads_metadata: { custom_label_0: "decoracion" },
  ...over,
});
const errs = (rows) => checkRows(rows, { temas: TEMAS }).errors.join("\n");

test("una fila bajo pedido bien escrita no da errores", () => {
  assert.equal(errs([row()]), "");
});

test("un producto bajo pedido debe decirlo y dar su plazo en la descripcion", () => {
  assert.match(errs([row({ description: "Maceta decorativa de Pikachu impresa en 3D. Envíos a todo el Perú." })]), /no dice que se fabrica bajo pedido/);
  assert.match(errs([row({ description: "Producto fabricado bajo pedido. Maceta decorativa de Pikachu impresa en 3D con filamento de calidad." })]), /no indica el plazo/);
  assert.match(errs([row({ availability: "pre_order", description: "Maceta decorativa de Pikachu impresa en 3D. Envíos a todo el Perú." })]), /no dice que se fabrica bajo pedido/);
});

test("no se pueden afirmar existencias inmediatas ni anunciar productos con disponibilidad desconocida", () => {
  for (const frase of ["Disponible en stock", "Entrega inmediata", "Pronta entrega", "Stock inmediato", "Envío inmediato", "Disponibilidad inmediata"]) {
    assert.match(errs([row({ description: `${row().description} ${frase}.` })]), /existencias o entrega inmediata/, frase);
  }
  assert.match(errs([row({ availability: "unknown" })]), /elegible para anuncios con disponibilidad unknown/);
  assert.equal(errs([row({ availability: "unknown", is_ads_eligible: false, description: "Maceta decorativa de Pikachu impresa en 3D. Envíos a todo el Perú." })]), "");
});

/* ------------------------------------------------------------ lectura de archivos CSV / TXT */
test("parseDelimited respeta comillas, comillas dobles, saltos de linea y el separador", () => {
  assert.deepEqual(parseDelimited('a,b,c\n1,"x,y","z ""q"""\n', ","), [["a", "b", "c"], ["1", "x,y", 'z "q"']]);
  assert.deepEqual(parseDelimited('a\tb\n1\t"x\ty"\n"l1\nl2"\tz\n', "\t"), [["a", "b"], ["1", "x\ty"], ["l1\nl2", "z"]]);
  assert.deepEqual(parseDelimited("a,b\r\n1,2", ","), [["a", "b"], ["1", "2"]]);
});

test("el TXT debe decir exactamente lo mismo que el CSV", () => {
  const csv = 'item_id,title\nx,"Hola, mundo"\ny,Adios\n';
  assert.deepEqual(checkTxtMatchesCsv(csv, 'item_id\ttitle\nx\t"Hola, mundo"\ny\tAdios\n').errors, []);
  assert.match(checkTxtMatchesCsv(csv, 'item_id\ttitle\nx\t"Hola, mundo"\n').errors.join("\n"), /filas/);
  assert.match(checkTxtMatchesCsv(csv, 'item_id\ttitle\nx\t"Hola, mundo"\ny\tOtro\n').errors.join("\n"), /CSV y TXT difieren/);
  assert.match(checkTxtMatchesCsv(csv, "id\ttitle\nx\tHola\ny\tAdios\n").errors.join("\n"), /columnas/);
});

/* ------------------------------------------------------------ lo que vera Ads Manager con una URL alojada */
const enc = (s) => new TextEncoder().encode(s);
const HEAD = REQUIRED.join(",");
const okCsv = `${HEAD}\n${REQUIRED.map((c) => c + "1").join(",")}\n`;
const hosted = (over = {}) => checkHostedFile({ url: "https://boomart.pe/feed-openai.csv", kind: "csv", status: 200, contentType: "text/csv; charset=utf-8", bytes: enc(okCsv), expectedRows: 1, ...over });

test("URL alojada: un CSV correcto pasa", () => {
  assert.deepEqual(hosted().errors, []);
  assert.deepEqual(hosted().warnings, []);
});

test("URL alojada: detecta redireccion, 404, tipo de contenido, BOM, UTF-8 roto, columnas y filas", () => {
  assert.match(hosted({ status: 301, location: "https://www.boomart.pe/feed.csv" }).errors.join("\n"), /redirige \(301\)/);
  assert.match(hosted({ status: 404 }).errors.join("\n"), /responde 404/);
  assert.match(hosted({ contentType: "application/octet-stream" }).errors.join("\n"), /Content-Type application\/octet-stream/);
  assert.match(hosted({ contentType: "text/csv" }).warnings.join("\n"), /charset=utf-8/);
  assert.match(hosted({ bytes: new Uint8Array([0xef, 0xbb, 0xbf, ...enc(okCsv)]) }).errors.join("\n"), /BOM/);
  assert.match(hosted({ bytes: new Uint8Array([0x69, 0xff, 0xfe, 0x0a]) }).errors.join("\n"), /UTF-8/);
  assert.match(hosted({ bytes: enc(okCsv.replace("price", "precio")) }).errors.join("\n"), /faltan las columnas obligatorias price/);
  assert.match(hosted({ expectedRows: 5 }).errors.join("\n"), /tiene 1 filas y se esperaban 5/);
  assert.match(hosted({ bytes: new Uint8Array() }).errors.join("\n"), /vacio/);
  assert.match(hosted({ bytes: enc(`${HEAD}\na,b\n`) }).errors.join("\n"), /distinto numero de celdas/);
});

test("URL alojada: el TXT debe ir separado por tabuladores y como text/plain", () => {
  const txt = (o = {}) => checkHostedFile({ url: "https://boomart.pe/feed-openai.txt", kind: "txt", status: 200, contentType: "text/plain; charset=utf-8", bytes: enc(`${REQUIRED.join("\t")}\n${REQUIRED.map((c) => c + "1").join("\t")}\n`), expectedRows: 1, ...o });
  assert.deepEqual(txt().errors, []);
  assert.match(txt({ bytes: enc(okCsv) }).errors.join("\n"), /no se separa por tabuladores/);
  assert.match(txt({ contentType: "application/octet-stream" }).errors.join("\n"), /Content-Type/);
});

test("los archivos REALES (CSV y TXT) cumplen lo que Ads Manager espera de una URL alojada", async () => {
  const csv = await rd("feed-openai.csv");
  const txt = await rd("feed-openai.txt");
  const rows = (await rd("feed-openai.jsonl")).trim().split("\n").length;
  const bytes = async (f) => new Uint8Array(await readFile(path.join(ROOT, f)));
  assert.deepEqual(checkHostedFile({ url: "csv", kind: "csv", status: 200, contentType: "text/csv; charset=utf-8", bytes: await bytes("feed-openai.csv"), expectedRows: rows }).errors, []);
  assert.deepEqual(checkHostedFile({ url: "txt", kind: "txt", status: 200, contentType: "text/plain; charset=utf-8", bytes: await bytes("feed-openai.txt"), expectedRows: rows }).errors, []);
  assert.deepEqual(checkTxtMatchesCsv(csv, txt).errors, []);
  // y las filas reales cumplen las reglas de disponibilidad honesta
  const real = (await rd("feed-openai.jsonl")).trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(checkRows(real, { temas: TEMAS }).errors.length, 0);
});

/* ------------------------------------------------------------ control del procesamiento en OpenAI */
// Registro de ejemplo de la documentacion oficial (Monitoring Uploads)
const DOC_EXAMPLE = { feed_id: "fd_123", upload_id: "sftp_upload_123", status: "completed_with_errors", rows_accepted: 1245, rows_rejected: 3, rows_ads_eligible: 1245, diagnostics: [{ code: "invalid_value", severity: "warning", field: "price", rows_affected: 3 }] };
const up = (over = {}) => ({ feed_id: "fd_1", upload_id: "u1", status: "completed", rows_accepted: 132, rows_rejected: 0, rows_ads_eligible: 131, completed_at: daysAgo(1), ...over });
const ev = (list, opts = {}) => evaluateUploads(list, { now: NOW, expectedRows: 132, expectedAdsEligible: 131, ...opts });

test("el procesamiento: una carga correcta y reciente no da errores", () => {
  const r = ev([up()]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.resumen.edadUltimaCargaProcesadaDias, 1);
});

test("el procesamiento: el ejemplo de la documentacion (3 filas rechazadas) se reporta con su diagnostico", () => {
  const r = evaluateUploads([DOC_EXAMPLE], { now: NOW });
  assert.match(r.errors.join("\n"), /3 filas rechazadas.*invalid_value\/price x3/);
});

test("el procesamiento: detecta carga fallida, omitida, en proceso, filas aceptadas de menos y sin cargas", () => {
  assert.match(ev([up({ status: "failed", diagnostics: [{ code: "missing_required_column", severity: "error", rows_affected: 0 }] })]).errors.join("\n"), /FALLO.*missing_required_column/);
  assert.match(ev([up({ status: "skipped" })]).errors.join("\n"), /OMITIDA/);
  assert.match(ev([up({ status: "processing" })]).warnings.join("\n"), /sigue en proceso/);
  assert.match(ev([up({ rows_accepted: 100 })]).errors.join("\n"), /acepto 100 de las 132 filas/);
  assert.match(ev([up({ rows_ads_eligible: 50 })]).warnings.join("\n"), /solo 50 filas quedaron elegibles/);
  assert.match(ev([]).errors.join("\n"), /ninguna carga/);
  assert.match(ev([up({ status: "weird" })]).errors.join("\n"), /estado desconocido/);
});

test("el procesamiento: avisa a los 7 dias y da error a los 12 (los productos caducan a las 2 semanas)", () => {
  assert.deepEqual(ev([up({ completed_at: daysAgo(6) })]).warnings, []);
  assert.match(ev([up({ completed_at: daysAgo(8) })]).warnings.join("\n"), /8\.0 dias.*renovarla/);
  assert.match(ev([up({ completed_at: daysAgo(13) })]).errors.join("\n"), /13\.0 dias.*caducan a las 2 semanas/);
});

test("el procesamiento: usa la carga MAS RECIENTE y la ultima exitosa para la antiguedad", () => {
  const list = [up({ upload_id: "viejo", completed_at: daysAgo(20) }), up({ upload_id: "nuevo", status: "failed", completed_at: daysAgo(1) }), up({ upload_id: "bueno", completed_at: daysAgo(3) })];
  const r = ev(list);
  assert.match(r.errors.join("\n"), /FALLO/); // la mas reciente fallo
  assert.doesNotMatch(r.errors.join("\n"), /caducan/); // pero hay una exitosa de hace 3 dias
});

test("el procesamiento: filtra por feed y entiende fechas en ISO, segundos y milisegundos", () => {
  const a = up({ feed_id: "fd_a", completed_at: daysAgo(1) });
  const b = up({ feed_id: "fd_b", status: "failed", completed_at: daysAgo(1) });
  assert.deepEqual(ev([a, b], { feedId: "fd_a" }).errors, []);
  assert.match(ev([a, b], { feedId: "fd_b" }).errors.join("\n"), /FALLO/);
  assert.match(ev([a], { feedId: "fd_zzz" }).errors.join("\n"), /ninguna carga del feed fd_zzz/);
  const iso = daysAgo(2);
  assert.equal(uploadStamp({ created_at: iso }), Date.parse(iso));
  assert.equal(uploadStamp({ created_at: Date.parse(iso) / 1000 }), Date.parse(iso));
  assert.equal(uploadStamp({ created_at: Date.parse(iso) }), Date.parse(iso));
  assert.equal(uploadStamp({}), null);
  assert.match(ev([{ ...up(), completed_at: undefined }]).warnings.join("\n"), /no devolvio fechas/);
});

/* ------------------------------------------------------------ el monitor completo contra una API FALSA */
async function runMonitor(payload, env = {}) {
  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== "Bearer clave-de-prueba") { res.writeHead(401).end("{}"); return; }
    res.setHeader("content-type", "application/json");
    if (req.url.startsWith("/v1/feeds/uploads")) res.end(JSON.stringify(payload));
    else if (req.url.startsWith("/v1/feeds")) res.end(JSON.stringify({ data: [{ id: "fd_1", product_count: 131 }] }));
    else res.writeHead(404).end("{}");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const child = spawn(process.execPath, [path.join(ROOT, "scripts", "check-openai-feed-processing.mjs")], {
    env: { ...process.env, OPENAI_ADS_API_KEY: "clave-de-prueba", OPENAI_ADS_API_BASE: `http://127.0.0.1:${port}/v1`, OPENAI_ADS_FEED_ID: "fd_1", ...env },
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const code = await new Promise((r) => child.on("close", r));
  server.close();
  return { code, out };
}

test("monitor: con una carga correcta y reciente termina bien y NO imprime la clave", async () => {
  const r = await runMonitor({ data: [up({ completed_at: new Date().toISOString() })] });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /clave-de-prueba/);
  assert.match(r.out, /"errores": 0/);
});

test("monitor: con una carga fallida o rechazos termina con error", async () => {
  const bad = await runMonitor({ data: [up({ status: "failed", completed_at: new Date().toISOString() })] });
  assert.equal(bad.code, 1, bad.out);
  assert.match(bad.out, /FALLO/);
  const rej = await runMonitor([{ ...DOC_EXAMPLE, feed_id: "fd_1", completed_at: new Date().toISOString() }]);
  assert.equal(rej.code, 1, rej.out);
});

test("monitor: con una clave incorrecta termina con error claro", async () => {
  const r = await runMonitor({ data: [] }, { OPENAI_ADS_API_KEY: "otra-clave" });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /401/);
});
