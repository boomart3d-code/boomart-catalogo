// IndexNow notifica URLs publicadas; una respuesta 200/202 no prueba indexación.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE = 'https://boomart.pe';
// Clave pública de verificación, ya publicada en la raíz del sitio.
const KEY = '20f2df66390ae288bb04a34ec5418613';
export function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'))
    .filter(url => { const u = new URL(url); return u.origin === SITE && !u.search && !u.hash; });
}
export function changedUrls(files, allowed) {
  const known = new Set(allowed);
  return [...new Set(files.filter(f => f.endsWith('.html')).map(file => {
    const pathname = file === 'index.html' ? '/' : '/' + file.replace(/\/index\.html$/, '/');
    return SITE + pathname;
  }).filter(url => known.has(url)))];
}
export async function submit(urls, request = fetch) {
  if (!urls.length) return { status: 'sin-cambios', submitted: 0 };
  const response = await request('https://api.indexnow.org/indexnow', {
    method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: 'boomart.pe', key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls }),
  });
  if (![200, 202].includes(response.status)) throw new Error(`IndexNow HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return { status: response.status, submitted: urls.length, meaning: 'Recibidas, no necesariamente indexadas' };
}
async function main() {
  const all = process.argv.includes('--all');
  const dry = process.argv.includes('--dry-run');
  const outputIndex = process.argv.indexOf('--output');
  const commitIndex = process.argv.indexOf('--commit');
  const commit = commitIndex < 0 ? 'HEAD' : process.argv[commitIndex + 1];
  if (!/^(HEAD|[0-9a-f]{40})$/.test(commit)) throw new Error('Commit inválido');
  const known = sitemapUrls(await readFile(path.join(ROOT, 'sitemap.xml'), 'utf8'));
  const files = all ? [] : execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', commit], { cwd: ROOT, encoding: 'utf8' }).trim().split(/\r?\n/);
  const urls = all ? known : changedUrls(files, known);
  // No avisar antes del despliegue: comprobar que la web sirve el mismo sitemap.
  if (!dry) {
    const key = await fetch(`${SITE}/${KEY}.txt`, { signal: AbortSignal.timeout(20000) });
    if (!key.ok || (await key.text()).trim() !== KEY) throw new Error('Clave pública inaccesible');
    // Verifica cada documento contra el archivo de este commit para evitar avisos prematuros.
    for (const url of urls) {
      const pathname = new URL(url).pathname;
      const relative = pathname.endsWith('/') ? pathname.slice(1) + 'index.html' : pathname.slice(1);
      const local = (await readFile(path.join(ROOT, relative), 'utf8')).replace(/\r\n/g, '\n');
      const live = await fetch(url, { signal: AbortSignal.timeout(20000), cache: 'no-store' });
      if (!live.ok || (await live.text()).replace(/\r\n/g, '\n') !== local) throw new Error(`Todavía no está publicado este documento: ${url}`);
    }
  }
  const result = { date: new Date().toISOString(), commit, urls, ...(dry ? { status: 'simulacion', submitted: 0 } : await submit(urls)) };
  if (outputIndex >= 0) await writeFile(path.resolve(process.argv[outputIndex + 1]), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
