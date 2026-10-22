// Revisa que NINGUNA página de producto/categoría se desborde en pantallas de celular
// (si el ancho del documento supera el de la pantalla, el usuario tiene que "pellizcar" y todo se achica).
// Uso:  node scripts/check-mobile-overflow.mjs [urlBase] [anchos] [secciones]
//   urlBase   por defecto http://localhost:4173  (sirve el repo con: python -m http.server 4173)
//   anchos    por defecto 320,360,390,414
//   secciones por defecto producto,categoria
// Requiere puppeteer-core (o el de D:\CLAUDE CODE\video-tools\boomart-videos) y Google Chrome.
// Salida: lista de páginas con problema y el elemento que se sale. Código de salida 1 si hay alguno.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] || "http://localhost:4173";
const widths = (process.argv[3] || "320,360,390,414").split(",").map(Number);
const sections = (process.argv[4] || "producto,categoria").split(",");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

let puppeteer;
for (const from of [ROOT + "/package.json", "file:///D:/CLAUDE%20CODE/video-tools/boomart-videos/package.json"]) {
  try { puppeteer = createRequire(from.startsWith("file:") ? from : "file:///" + from)("puppeteer-core"); break; } catch { /* siguiente */ }
}
if (!puppeteer) { console.error("No se encontró puppeteer-core."); process.exit(2); }

const urls = [];
for (const sec of sections) {
  const dir = path.join(ROOT, sec);
  if (!fs.existsSync(dir)) continue;
  for (const d of fs.readdirSync(dir)) if (fs.existsSync(path.join(dir, d, "index.html"))) urls.push(`/${sec}/${d}/`);
}
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
const bad = [];
for (const w of widths) {
  await page.setViewport({ width: w, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  for (const u of urls) {
    await page.goto(`${base}${u}?excluir=1`, { waitUntil: "load", timeout: 60000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    const r = await page.evaluate((vw) => {
      const de = document.documentElement;
      const over = [];
      document.querySelectorAll("body *").forEach((e) => {
        const b = e.getBoundingClientRect();
        if (b.width > 0 && (b.right > vw + 1 || b.left < -1)) {
          let p = e.parentElement, scroller = false;
          while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") { scroller = true; break; } p = p.parentElement; }
          if (!scroller) over.push(`${e.tagName}.${String(e.className).slice(0, 30)} L${Math.round(b.left)} R${Math.round(b.right)}`);
        }
      });
      return { sw: de.scrollWidth, cw: de.clientWidth, over: over.slice(0, 4) };
    }, w);
    if (r.sw > r.cw + 1 || r.over.length) bad.push({ ancho: w, pagina: u, scrollWidth: r.sw, pantalla: r.cw, elementos: r.over });
  }
}
await browser.close();
console.log(`Páginas revisadas: ${urls.length} × anchos ${widths.join("/")}  ->  con problema: ${bad.length}`);
if (bad.length) { console.log(JSON.stringify(bad, null, 1)); process.exit(1); }
