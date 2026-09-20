/*
 * Optimiza las fotos de assets/products/ en dos frentes:
 *
 *   1. Genera una copia .webp (calidad 82) al lado de cada .jpg/.jpeg/.png,
 *      para que la tienda, los modales y las paginas generadas carguen esa
 *      version mas liviana.
 *   2. Deja el .jpg original listo para las etiquetas <meta property="og:image">
 *      de WhatsApp/Facebook/Meta (que fallan con .webp/.avif): si ya pesa
 *      <300 KB no lo toca; si pesa mas, lo recomprime (reduciendo calidad y,
 *      si hace falta, el lado mas largo a un maximo de 1200px) hasta bajar de
 *      300 KB, SIN cambiar su nombre ni su ruta (todas las og:image siguen
 *      apuntando al mismo archivo .jpg de siempre).
 *
 * No borra ni renombra nada. No toca data/products.json, catalogo.json ni los
 * feeds (Google/Meta) -- esos siguen en .jpg, que es lo que exigen esas
 * plataformas. Los <img> que muestran fotos en pantalla (tarjetas, modal,
 * paginas de producto/categoria, carrito) se actualizan aparte, en el codigo
 * que las dibuja, para pedir el .webp si existe.
 *
 * Requiere el paquete "sharp" instalado en node_modules (no forma parte del
 * repo -- ver README/bitacora). Si falta, instalar con:
 *   npm install sharp
 *
 * Uso:
 *   node scripts/optimize-images.mjs            (solo reporta, no escribe nada)
 *   node scripts/optimize-images.mjs --aplicar   (genera/recomprime de verdad)
 *   node scripts/optimize-images.mjs --dir assets/otra-carpeta --aplicar
 */

import sharp from "sharp";
import { readdir, stat, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const APPLY = args.includes("--aplicar");
const dirFlagIndex = args.indexOf("--dir");
const TARGET_DIR = path.join(
  ROOT,
  dirFlagIndex !== -1 && args[dirFlagIndex + 1] ? args[dirFlagIndex + 1] : "assets/products",
);

const WEBP_QUALITY = 82;
const OG_MAX_BYTES = 300 * 1024;
const OG_MAX_SIDE = 1200; // solo se aplica si el .jpg supera OG_MAX_BYTES
const WEB_MAX_SIDE = 1600; // tope de seguridad para el .webp, no reduce nada hoy

const IMAGE_EXT = /\.(jpe?g|png)$/i;

const kb = (bytes) => (bytes / 1024).toFixed(1);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Escribe SIEMPRE a un archivo temporal nuevo y recien entonces reemplaza el
// destino con un rename. fs.writeFile directo al mismo archivo que se acaba
// de leer (para recomprimir un .jpg en su propio sitio) trunca el archivo
// ANTES de escribir -- si el write falla o choca con un handle que el SO/
// antivirus en Windows todavia no solto ("UNKNOWN: unknown error", "unable to
// open for write"), el original queda en 0 bytes. Con el temporal, el archivo
// real nunca se toca hasta que la escritura completa ya tuvo exito.
async function atomicWrite(filePath, buffer, attempts = 5) {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  for (let i = 1; i <= attempts; i++) {
    try {
      await writeFile(tmpPath, buffer);
      await rename(tmpPath, filePath);
      return;
    } catch (err) {
      await rm(tmpPath, { force: true }).catch(() => {});
      if (i === attempts) throw err;
      await sleep(150 * i);
    }
  }
}

async function listImages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && IMAGE_EXT.test(e.name))
    .map((e) => e.name)
    .sort();
}

async function makeWebp(srcPath, destPath) {
  const meta = await sharp(srcPath).metadata();
  let pipeline = sharp(srcPath);
  if ((meta.width || 0) > WEB_MAX_SIDE || (meta.height || 0) > WEB_MAX_SIDE) {
    pipeline = pipeline.resize({
      width: WEB_MAX_SIDE,
      height: WEB_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  const buffer = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
  if (APPLY) await atomicWrite(destPath, buffer);
  return buffer.length;
}

// Recomprime el .jpg SOLO si hace falta para bajar de 300 KB; nunca sube la
// calidad de un archivo que ya esta liviano, para no perder calidad sin motivo.
async function ensureOgJpg(srcPath, originalBytes) {
  if (originalBytes <= OG_MAX_BYTES) {
    return { changed: false, bytes: originalBytes };
  }
  const meta = await sharp(srcPath).metadata();
  const needsResize = (meta.width || 0) > OG_MAX_SIDE || (meta.height || 0) > OG_MAX_SIDE;
  let quality = 82;
  let buffer;
  for (; quality >= 45; quality -= 6) {
    let pipeline = sharp(srcPath);
    if (needsResize) {
      pipeline = pipeline.resize({
        width: OG_MAX_SIDE,
        height: OG_MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    buffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    if (buffer.length <= OG_MAX_BYTES) break;
  }
  if (APPLY) await atomicWrite(srcPath, buffer);
  return { changed: true, bytes: buffer.length, quality };
}

async function main() {
  const files = await listImages(TARGET_DIR);
  if (!files.length) {
    console.log(`No se encontraron imagenes en ${TARGET_DIR}`);
    return;
  }

  console.log(
    `${APPLY ? "APLICANDO cambios" : "SOLO REPORTE (usa --aplicar para escribir)"} sobre ${files.length} imagenes en ${path.relative(ROOT, TARGET_DIR)}\n`,
  );

  let totalJpgBefore = 0;
  let totalJpgAfter = 0;
  let totalWebp = 0;
  let jpgRecompressed = 0;
  let webpCreated = 0;
  const rows = [];

  for (const name of files) {
    const srcPath = path.join(TARGET_DIR, name);
    const before = (await stat(srcPath)).size;
    totalJpgBefore += before;

    const webpName = name.replace(IMAGE_EXT, ".webp");
    const webpPath = path.join(TARGET_DIR, webpName);
    const webpBytes = await makeWebp(srcPath, webpPath);
    totalWebp += webpBytes;
    webpCreated += 1;

    const og = await ensureOgJpg(srcPath, before);
    totalJpgAfter += og.bytes;
    if (og.changed) jpgRecompressed += 1;

    rows.push({
      name,
      jpgBeforeKB: kb(before),
      jpgAfterKB: kb(og.bytes),
      webpKB: kb(webpBytes),
      recompressed: og.changed,
    });
  }

  console.log("Archivo".padEnd(48), "JPG antes".padStart(10), "JPG despues".padStart(12), "WEBP".padStart(10));
  for (const r of rows) {
    console.log(
      r.name.padEnd(48),
      (r.jpgBeforeKB + " KB").padStart(10),
      (r.jpgAfterKB + " KB" + (r.recompressed ? "*" : "")).padStart(12),
      (r.webpKB + " KB").padStart(10),
    );
  }

  console.log("\n--- Resumen ---");
  console.log(`Imagenes procesadas:        ${files.length}`);
  console.log(`.webp generados:            ${webpCreated}`);
  console.log(`.jpg recomprimidos (>300KB):${" ".repeat(0)} ${jpgRecompressed}  (marcados con * arriba)`);
  console.log(`Peso total .jpg antes:      ${(totalJpgBefore / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Peso total .jpg despues:    ${(totalJpgAfter / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Peso total .webp:           ${(totalWebp / 1024 / 1024).toFixed(2)} MB`);
  console.log(
    `Ahorro si la web sirve .webp: ${(((totalJpgBefore - totalWebp) / totalJpgBefore) * 100).toFixed(0)}% menos peso vs. los .jpg originales`,
  );
  if (!APPLY) {
    console.log("\nNada se escribio en disco todavia -- vuelve a correr con --aplicar para generar los archivos.");
  }
}

main().catch((err) => {
  console.error("Error optimizando imagenes:", err);
  process.exitCode = 1;
});
