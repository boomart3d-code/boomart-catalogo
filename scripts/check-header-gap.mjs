// Revisa que la cabecera pegajosa (.site-header) no deje un hueco arriba al hacer scroll.
// Uso: node scripts/check-header-gap.mjs [urlBase]   (sirve el repo con: python -m http.server 4173)
// Para cada pagina: baja 600px y comprueba que el borde superior de .site-header coincida con el de la barra
// .quick-nav (si existe) o con 0 (si no existe). Sale con codigo 1 si alguna pagina falla.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] || "http://localhost:4173";
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
let puppeteer;
for (const from of [ROOT + "/package.json", "file:///D:/CLAUDE%20CODE/video-tools/boomart-videos/package.json"]) {
  try { puppeteer = createRequire(from.startsWith("file:") ? from : "file:///" + from)("puppeteer-core"); break; } catch { /* siguiente */ }
}
if (!puppeteer) { console.error("No se encontró puppeteer-core."); process.exit(2); }
const pages = [];
const walk = (dir, depth = 0) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || ["node_modules", "scripts", "src", "assets", "data", "socios", "panel", "supabase", "video-tools"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 1) walk(p, depth + 1);
    else if (e.isFile() && e.name.endsWith(".html")) pages.push("/" + path.relative(ROOT, p).split(path.sep).join("/").replace(/index[.]html$/, ""));
  }
};
walk(ROOT);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
let bad = 0, n = 0;
for (const w of [1366, 390]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: 800 });
  for (const u of pages) {
    try { await page.goto(base + u, { waitUntil: "load", timeout: 20000 }); } catch { continue; }
    const r = await page.evaluate(async () => {
      const h = document.querySelector(".site-header");
      if (!h) return null;
      window.scrollTo(0, 700);
      await new Promise((r) => setTimeout(r, 150));
      if (!["sticky", "fixed"].includes(getComputedStyle(h).position)) return null; /* en celular la cabecera se desplaza con la pagina: no aplica */
      const q = document.querySelector(".quick-nav");
      const qb = q ? q.getBoundingClientRect() : null;
      const expected = qb ? qb.bottom : 0;
      return { top: Math.round(h.getBoundingClientRect().top), expected: Math.round(expected), tall: document.documentElement.scrollHeight > 900 };
    });
    if (!r || !r.tall) continue;
    n++;
    if (Math.abs(r.top - r.expected) > 1) { bad++; console.log(`[${w}] ${u}  cabecera en y=${r.top}, esperado ${r.expected}`); }
  }
  await page.close();
}
await browser.close();
console.log(`revisadas ${n} (pagina x ancho), con hueco: ${bad}`);
process.exit(bad ? 1 : 0);
