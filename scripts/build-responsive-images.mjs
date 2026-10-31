/* Derivados por ancho, sin recortes ni sobrescritura de fotos originales.
 * Uso: node scripts/build-responsive-images.mjs
 * Se ejecuta tambien en GitHub Actions antes de regenerar las paginas.
 */
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let sharp;
try { sharp = createRequire(import.meta.url)('sharp'); }
catch { sharp = createRequire('D:/CODIGOS BOOMART APP/package.json')('sharp'); }
const WIDTHS = [120, 360, 720, 1200];
const manifest = {};
let created = 0;
async function writeChanged(file, value) {
  if (await readFile(file, 'utf8').catch(() => '') !== value) await writeFile(file, value);
}
for (const folder of ['products', 'hero']) {
  const directory = path.join(ROOT, 'assets', folder);
  const names = (await readdir(directory)).filter(n => /\.(webp|png|jpe?g)$/i.test(n)).sort();
  const sources = new Map();
  for (const name of names) {
    const key = name.replace(/\.(png|jpe?g)$/i, '.webp');
    if (!sources.has(key) || /\.webp$/i.test(name)) sources.set(key, name);
  }
  await mkdir(path.join(ROOT, 'assets', 'responsive', folder), { recursive: true });
  for (const [key, name] of [...sources].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const source = await readFile(path.join(directory, name));
    const metadata = await sharp(source).metadata();
    const hash = createHash('sha256').update(source).digest('hex').slice(0, 12);
    const entry = { w: metadata.width, h: metadata.height, src: `assets/${folder}/${name}`, v: [] };
    for (const width of WIDTHS.filter(w => w < metadata.width)) {
      const file = `assets/responsive/${folder}/${key.replace(/\.webp$/i, '')}-${hash}-${width}w.webp`;
      if (!(await stat(path.join(ROOT, file)).catch(() => null))) {
        await sharp(source).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(ROOT, file));
        created++;
      }
      entry.v.push([width, file]);
    }
    manifest[`assets/${folder}/${key}`] = entry;
  }
}
await writeChanged(path.join(ROOT, 'assets/responsive/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeChanged(path.join(ROOT, 'src/image-sources.js'), '/* Generado por scripts/build-responsive-images.mjs. */\nwindow.BOOMART_IMAGE_SOURCES=' + JSON.stringify(manifest).replace(/</g, '\\u003c') + ';\n');
console.log(JSON.stringify({ images: Object.keys(manifest).length, variantsCreated: created }));
