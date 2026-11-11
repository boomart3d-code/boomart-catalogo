// Comprueba, contra el sitio PUBLICADO (o uno local), que lo que ve OpenAI es correcto:
//  1. robots.txt permite a OAI-AdsBot y OAI-SearchBot todas las paginas, fotos y archivos del feed;
//  2. cada pagina y cada foto del feed responde 200 (sin redirecciones) a ambos rastreadores;
//  3. la ficha publicada tiene canonical correcta, sin noindex, y el mismo precio que la fila del feed;
//  4. el feed publicado es el mismo que genera el catalogo actual (detecta feed desactualizado).
//
// Uso:   node scripts/check-openai-feed-access.mjs [--base https://boomart.pe] [--no-images] [--concurrency 8]
//        (con --base http://localhost:4173 prueba una copia local servida con python -m http.server)
// Sale con codigo 1 si hay errores. Solo hace peticiones GET/HEAD a paginas publicas.

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { robotsAllows } from "./robots-check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://boomart.pe";
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const BASE = String(arg("base", SITE)).replace(/\/+$/, "");
const CONCURRENCY = Number(arg("concurrency", 8));
const WITH_IMAGES = !process.argv.includes("--no-images");
// Cadenas de User-Agent publicadas por OpenAI (https://platform.openai.com/docs/bots y la guia para anunciantes).
const BOTS = [
  { name: "OAI-AdsBot", ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-AdsBot/1.0; +https://openai.com/adsbot" },
  { name: "OAI-SearchBot", ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot" },
];
const errors = [];
const warnings = [];
const live = (u) => u.replace(SITE, BASE);
const sha = (s) => createHash("sha256").update(s).digest("hex");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Un 429/5xx o un corte de red suele ser pasajero (GitHub Pages lo hace de vez en cuando): se
// reintenta con espera antes de dar la URL por mala, para no dar falsas alarmas en el flujo diario.
const TRANSIENT = (s) => s === 0 || s === 429 || (s >= 500 && s <= 599);
async function request(url, ua, method = "HEAD", init = {}) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(1000 * 2 ** (attempt - 1));
    try {
      last = await fetch(url, { method, redirect: "manual", headers: { "user-agent": ua }, signal: AbortSignal.timeout(30000), ...init });
    } catch (e) {
      last = { status: 0, headers: new Headers(), error: e.message };
    }
    if (!TRANSIENT(last.status)) return last;
  }
  return last;
}
const getText = async (url) => {
  const r = await request(url, "BoomArt-check/1.0", "GET", { redirect: "follow" });
  return { ok: r.status === 200, status: r.status, text: r.status === 200 ? await r.text() : "" };
};
async function pool(items, worker) {
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) await worker(items[next++]);
  }));
}

const localJsonl = await readFile(path.join(ROOT, "feed-openai.jsonl"), "utf8");
const rows = localJsonl.trim().split("\n").map((l) => JSON.parse(l));
const pages = [...new Set(rows.map((r) => r.url))];
const images = [...new Set(rows.flatMap((r) => [r.image_url, ...(r.additional_image_urls || [])]))];
const feedFiles = ["feed-openai.jsonl", "feed-openai.csv", "feed-openai.meta.json", "feed-openai-grupos.json", "robots.txt", "sitemap.xml"].map((f) => `${SITE}/${f}`);

/* 1. robots.txt */
const robotsRes = await getText(`${BASE}/robots.txt`);
if (!robotsRes.ok) errors.push(`robots.txt responde ${robotsRes.status}`);
const robotsText = robotsRes.text;
const allTargets = [...pages, ...(WITH_IMAGES ? images : []), ...feedFiles];
for (const bot of BOTS) {
  const blocked = [...new Set(allTargets.filter((u) => !robotsAllows(robotsText, bot.name, new URL(u).pathname)))];
  if (blocked.length) errors.push(`robots.txt bloquea a ${bot.name} en ${blocked.length} URL (p. ej. ${blocked[0]})`);
}

/* 2. paginas, fotos y archivos del feed: 200, sin redireccion, tipo correcto */
const jobs = [
  ...pages.map((u) => ({ u, kind: "pagina" })),
  ...(WITH_IMAGES ? images.map((u) => ({ u, kind: "foto" })) : []),
  ...feedFiles.map((u) => ({ u, kind: "archivo" })),
];
const status = new Map();
await pool(jobs, async (job) => {
  for (const bot of BOTS) {
    let r = await request(live(job.u), bot.ua, "HEAD");
    if (r.status === 405 || r.status === 403 || r.status === 501) r = await request(live(job.u), bot.ua, "GET");
    const type = r.headers.get("content-type") || "";
    const problem =
      r.status !== 200
        ? r.status >= 300 && r.status < 400
          ? `redirige (${r.status}) a ${r.headers.get("location")}`
          : `responde ${r.status}${r.error ? ` (${r.error})` : ""}`
        : job.kind === "foto" && !/^image\//i.test(type)
          ? `no es una imagen (${type})`
          : job.kind === "pagina" && !/text\/html/i.test(type)
            ? `no es HTML (${type})`
            : null;
    status.set(`${bot.name}|${job.u}`, problem || "ok");
    if (problem) errors.push(`${bot.name} ${job.kind} ${job.u}: ${problem}`);
  }
});

/* 3. contenido de cada ficha como la ve OAI-AdsBot: canonical, sin noindex, mismo precio */
const rowsByPage = new Map();
for (const r of rows) (rowsByPage.get(r.url) || rowsByPage.set(r.url, []).get(r.url)).push(r);
await pool(pages, async (u) => {
  const r = await request(live(u), BOTS[0].ua, "GET");
  if (r.status !== 200) return; // ya reportado arriba
  const html = await r.text();
  const canonical = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1];
  if (canonical !== u) errors.push(`ficha ${u}: canonical publicada es ${canonical}`);
  if (/<meta[^>]*name=["']robots["'][^>]*noindex/i.test(html)) errors.push(`ficha ${u}: tiene noindex`);
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).find((j) => j && j["@type"] === "Product");
  if (!ld) return errors.push(`ficha ${u}: no trae datos estructurados Product`);
  const offers = [].concat(ld.offers || []);
  for (const row of rowsByPage.get(u)) {
    const offer = offers.find((o) => o.sku === row.item_id);
    if (!offer) errors.push(`ficha ${u}: no publica la opcion ${row.item_id} que el feed ofrece`);
    else if (`${Number(offer.price).toFixed(2)} PEN` !== row.price) errors.push(`ficha ${u}: precio publicado ${offer.price} distinto del feed (${row.price}) en ${row.item_id}`);
  }
});

/* 4. el feed PUBLICADO es el que genera el catalogo actual */
const liveFeedRes = await getText(`${BASE}/feed-openai.jsonl`);
const liveMetaRes = await getText(`${BASE}/feed-openai.meta.json`);
let ageDays = null;
if (!liveFeedRes.ok || !liveMetaRes.ok) errors.push(`no se pudo leer el feed o sus metadatos publicados (${liveFeedRes.status}/${liveMetaRes.status})`);
else {
  const liveJsonl = liveFeedRes.text;
  const liveMeta = JSON.parse(liveMetaRes.text);
  if (sha(liveJsonl) !== sha(localJsonl)) errors.push("el feed PUBLICADO no coincide con el que genera el catalogo actual: esta desactualizado o el despliegue va atrasado");
  if (liveMeta.sha256Jsonl !== sha(liveJsonl)) errors.push("la huella de feed-openai.meta.json no corresponde al feed publicado");
  ageDays = Math.floor((Date.now() - new Date(`${liveMeta.generadoEl}T00:00:00Z`).getTime()) / 864e5);
}

const summary = {
  base: BASE,
  filasDelFeed: rows.length,
  paginas: pages.length,
  fotos: WITH_IMAGES ? images.length : "no revisadas",
  rastreadores: BOTS.map((b) => b.name),
  peticiones: status.size,
  edadDelFeedPublicadoEnDias: ageDays,
  errores: errors.length,
  avisos: warnings.length,
};
console.log(JSON.stringify(summary, null, 2));
for (const w of warnings) console.log("AVISO:", w);
for (const e of errors.slice(0, 60)) console.log("ERROR:", e);
if (errors.length > 60) console.log(`... y ${errors.length - 60} errores mas`);
if (errors.length) process.exitCode = 1;
