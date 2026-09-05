// Comprime/redimensiona automaticamente las fotos de productos que se acaban de
// subir o cambiar (via el panel de administracion o directamente por git), para
// que ninguna foto pese mas de lo necesario en la web.
import { execSync } from "node:child_process";
import { stat } from "node:fs/promises";
import sharp from "sharp";

const MAX_DIMENSION = 1600; // px, en el lado mas largo
const JPEG_QUALITY = 82;
const PNG_QUALITY = 82;

function changedProductImages() {
  try {
    const out = execSync("git diff --name-only HEAD~1 HEAD -- assets/products", {
      encoding: "utf8",
    });
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && /\.(jpe?g|png)$/i.test(line));
  } catch (err) {
    console.error("No se pudo calcular que fotos cambiaron:", err.message);
    return [];
  }
}

async function optimizeOne(file) {
  let before;
  try {
    before = (await stat(file)).size;
  } catch {
    console.log(`(omitido, ya no existe) ${file}`);
    return;
  }

  try {
    const source = sharp(file);
    const meta = await source.metadata();
    const longSide = Math.max(meta.width || 0, meta.height || 0);
    const pipeline =
      longSide > MAX_DIMENSION
        ? source.resize({
            width: MAX_DIMENSION,
            height: MAX_DIMENSION,
            fit: "inside",
            withoutEnlargement: true,
          })
        : source;

    const isPng = (meta.format || "").toLowerCase() === "png";
    const buffer = isPng
      ? await pipeline.png({ quality: PNG_QUALITY, compressionLevel: 9 }).toBuffer()
      : await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();

    if (buffer.length < before) {
      await sharp(buffer).toFile(file);
      console.log(`Optimizada ${file}: ${(before / 1024).toFixed(0)} KB -> ${(buffer.length / 1024).toFixed(0)} KB`);
    } else {
      console.log(`Ya estaba optima, sin cambios: ${file}`);
    }
  } catch (err) {
    console.error(`Error optimizando ${file}:`, err.message);
  }
}

const targets = changedProductImages();
if (!targets.length) {
  console.log("No hay fotos de productos nuevas o modificadas en este push.");
} else {
  console.log(`Revisando ${targets.length} foto(s)...`);
  for (const file of targets) {
    await optimizeOne(file);
  }
}
