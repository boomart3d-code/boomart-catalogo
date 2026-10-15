// Miniaturas para compartir (WhatsApp, Facebook, Telegram...) — 2026-10-15.
//
// WhatsApp no muestra la vista previa si la imagen de og:image es pesada
// (en la practica, mas de ~300 KB) y varias fotos principales son PNG de
// 700 KB a 1,2 MB. Este script genera, para cada producto de
// data/products.json, una copia JPEG liviana de su foto principal en
// assets/og/<id>.jpg (lado mayor 1200 px, < 250 KB) y anota en
// assets/og/manifest.json de que foto salio y sus medidas.
// scripts/build-ai-catalog.mjs usa ese manifiesto para el og:image de cada
// pagina de producto. Solo se regenera lo que cambio (huella de la foto).
//
// Se ejecuta en GitHub Actions (build-ai-catalog.yml) antes de generar las
// paginas; necesita sharp: npm install --no-save sharp
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "assets", "og");
const MANIFEST = path.join(OUT_DIR, "manifest.json");
const MAX_SIDE = 1200;
const MAX_BYTES = 250 * 1024;

const products = JSON.parse(readFileSync(path.join(ROOT, "data", "products.json"), "utf8"));
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
mkdirSync(OUT_DIR, { recursive: true });

const firstImage = (p) => ((p.gallery && p.gallery.length ? p.gallery : [p.image]).filter(Boolean))[0];

let made = 0;
let kept = 0;
const next = {};
for (const p of products) {
  const src = firstImage(p);
  if (!src || /^https?:\/\//i.test(src)) continue;
  const srcPath = path.join(ROOT, src);
  if (!existsSync(srcPath)) {
    console.warn(`(sin foto) ${p.id}: ${src} no existe`);
    continue;
  }
  const hash = createHash("sha1").update(readFileSync(srcPath)).digest("hex").slice(0, 16);
  const outPath = path.join(OUT_DIR, `${p.id}.jpg`);
  const prev = manifest[p.id];
  if (prev && prev.source === src && prev.hash === hash && existsSync(outPath)) {
    next[p.id] = prev;
    kept++;
    continue;
  }

  // Fondo blanco por si la foto tiene transparencia (JPEG no la admite).
  const base = sharp(srcPath)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" });
  let quality = 82;
  let buffer = await base.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
  while (buffer.length > MAX_BYTES && quality > 50) {
    quality -= 6;
    buffer = await base.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
  }
  writeFileSync(outPath, buffer);
  const meta = await sharp(buffer).metadata();
  next[p.id] = { source: src, hash, width: meta.width, height: meta.height, bytes: buffer.length };
  made++;
  console.log(`Miniatura ${p.id}.jpg: ${meta.width}x${meta.height}, ${(buffer.length / 1024).toFixed(0)} KB (calidad ${quality})`);
}

// Quitar miniaturas de productos que ya no existen.
for (const file of readdirSync(OUT_DIR)) {
  if (!file.endsWith(".jpg")) continue;
  const id = file.slice(0, -4);
  if (!next[id]) {
    unlinkSync(path.join(OUT_DIR, file));
    console.log(`Eliminada miniatura huerfana ${file}`);
  }
}

writeFileSync(MANIFEST, JSON.stringify(next, null, 2) + "\n");
console.log(`Miniaturas para compartir: ${made} nuevas/actualizadas, ${kept} sin cambios.`);
