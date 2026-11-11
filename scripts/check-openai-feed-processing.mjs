// Comprueba en OpenAI (API de Ads, solo LECTURA) que el catalogo se PROCESO bien y que sigue vigente:
// estado de la ultima carga, filas aceptadas/rechazadas, diagnosticos y antiguedad (los productos caducan
// a las 2 semanas si no se renuevan). Necesita una clave de API de Ads con permiso sobre los feeds:
//
//   OPENAI_ADS_API_KEY=...  [OPENAI_ADS_FEED_ID=fd_...]  node scripts/check-openai-feed-processing.mjs [--require]
//
// Sin clave NO hace nada y sale con codigo 0 (salvo --require). Nunca imprime la clave. No crea, cambia ni
// borra nada en la cuenta: solo hace GET.
// Estado: evaluado con las respuestas de ejemplo de la documentacion; NO probado contra la API real.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateUploads } from "./openai-processing.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.OPENAI_ADS_API_BASE || "https://api.ads.openai.com/v1";
const key = process.env.OPENAI_ADS_API_KEY || "";
const feedId = process.env.OPENAI_ADS_FEED_ID || null;

if (!key) {
  const msg = "OPENAI_ADS_API_KEY no esta definida: se omite la comprobacion del procesamiento en OpenAI (ver docs/CHATGPT_ADS.md).";
  if (process.argv.includes("--require")) {
    console.error(`ERROR: ${msg}`);
    process.exit(1);
  }
  console.log(`AVISO: ${msg}`);
  process.exit(0);
}

const get = async (url) => {
  const r = await fetch(url, { headers: { authorization: `Bearer ${key}`, accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* la respuesta no es JSON */
  }
  return { status: r.status, json, text: text.slice(0, 300) };
};

const rows = (await readFile(path.join(ROOT, "feed-openai.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
const expectedRows = rows.length;
const expectedAdsEligible = rows.filter((r) => r.is_ads_eligible === true).length;

const up = await get(`${API}/feeds/uploads`);
if (up.status !== 200 || !up.json) {
  console.error(`ERROR: GET /feeds/uploads respondio ${up.status}: ${up.text}`);
  process.exit(1);
}
const list = Array.isArray(up.json) ? up.json : up.json.data || up.json.uploads || [];
const result = evaluateUploads(list, { feedId, expectedRows, expectedAdsEligible });

// Conteo actual del feed (informativo: cuenta registros de oferta ingeridos y elegibles para anuncios)
const feeds = await get(`${API}/feeds?include[]=product_count`);
const feedList = feeds.json ? (Array.isArray(feeds.json) ? feeds.json : feeds.json.data || []) : [];
const mine = feedId ? feedList.find((f) => f.id === feedId || f.feed_id === feedId) : feedList[0];
if (feeds.status === 200 && mine && typeof mine.product_count === "number") {
  result.resumen = { ...(result.resumen || {}), productosEnElFeed: mine.product_count };
  if (mine.product_count === 0) result.warnings.push("el feed muestra 0 productos elegibles (puede ser normal mientras se procesa la primera carga)");
}

console.log(
  JSON.stringify(
    {
      feed: feedId || "(el primero)",
      esperadas: { filas: expectedRows, elegibles: expectedAdsEligible },
      resumen: result.resumen,
      errores: result.errors.length,
      avisos: result.warnings.length,
    },
    null,
    2,
  ),
);
for (const w of result.warnings) console.log("AVISO:", w);
for (const e of result.errors) console.log("ERROR:", e);
if (result.errors.length) process.exitCode = 1;
