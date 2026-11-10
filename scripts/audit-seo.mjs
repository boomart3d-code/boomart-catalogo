// Revisión del HTML que realmente reciben los buscadores; no usa JavaScript del sitio.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sitemapUrls, SITE } from './indexnow.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const live = process.argv.includes('--live');
const out = process.argv.indexOf('--output');
const get = async relative => {
  if (!live) return readFile(path.join(ROOT, relative), 'utf8');
  const r = await fetch(`${SITE}/${relative.replace(/index\.html$/, '')}`, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
};
const urls = sitemapUrls(await get('sitemap.xml'));
const results = [];
const titles = new Map();
let next = 0;
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1];
const text = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
await Promise.all(Array.from({length: 6}, async () => {
  while (next < urls.length) {
    const url = urls[next++];
    const issues = [];
    try {
      const pathname = new URL(url).pathname;
      const relative = pathname.endsWith('/') ? pathname.slice(1) + 'index.html' : pathname.slice(1);
      const html = await get(relative);
      const title = text(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
      const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => m[0]);
      const description = attr(meta.find(t => attr(t, 'name') === 'description') || '', 'content');
      const canonicalTag = [...html.matchAll(/<link\b[^>]*>/gi)].find(m => attr(m[0], 'rel') === 'canonical')?.[0] || '';
      const canonical = attr(canonicalTag, 'href');
      if (!title) issues.push('Sin title');
      if (!description) issues.push('Sin descripcion');
      if (canonical !== url) issues.push(`Canonica distinta: ${canonical}`);
      if (meta.some(m => attr(m, 'name') === 'robots' && /noindex/i.test(attr(m, 'content') || ''))) issues.push('Noindex en sitemap');
      const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
      if (h1.length !== 1) issues.push(`${h1.length} H1 en HTML`);
      const schemas = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m => JSON.parse(m[1]));
      const nodes = schemas.flatMap(s => Array.isArray(s) ? s : s['@graph'] || [s]);
      if (pathname.startsWith('/producto/')) {
        const p = nodes.find(n => n['@type'] === 'Product');
        if (!p?.name || !p?.image || !p?.offers) issues.push('Product incompleto');
        // Una ficha con varias opciones publica una Offer por opcion (con nombre,
        // SKU y precio propios). AggregateOffer mezclaba precios de piezas distintas
        // y Google no lo admite en fichas de comerciante.
        const offers = [].concat(p?.offers || []);
        if (offers.some(o => o['@type'] !== 'Offer')) issues.push('La oferta no es de tipo Offer');
        if (offers.some(o => o.priceCurrency !== 'PEN')) issues.push('Moneda distinta de PEN');
        if (offers.some(o => !(Number(o.price) > 0))) issues.push('Precio invalido');
        if (offers.length > 1 && offers.some(o => !o.name || !o.sku)) issues.push('Opcion sin nombre o SKU');
        if (new Set(offers.map(o => o.sku)).size !== offers.length) issues.push('SKU repetido entre opciones');
        if (/\p{Extended_Pictographic}/u.test(p?.name || '')) issues.push('Emoji en el nombre del Product');
        if (!h1[0] || !html.includes('<main class="pp">')) issues.push('Ficha no presente en HTML');
      }
      if (!/<html[^>]*\blang=["']es-PE["']/i.test(html)) issues.push('Idioma distinto de es-PE');
      const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map(m => new URL(m[1].replace(/&amp;/g, '&'), url).href);
      if (url === `${SITE}/`) {
        const categories = urls.filter(u => new URL(u).pathname.startsWith('/categoria/') && !u.includes('series-y-peliculas'));
        for (const category of categories) if (!links.includes(category)) issues.push(`Falta enlace HTML: ${category}`);
      }
      if (titles.has(title)) issues.push(`Title duplicado con ${titles.get(title)}`);
      titles.set(title, url);
      results.push({url, title, canonical, h1: h1.map(m => text(m[1])), schemas:nodes.map(n=>n['@type']), issues});
    } catch(error) {results.push({url, issues:[error.message]});}
  }
}));
results.sort((a,b)=>a.url.localeCompare(b.url));
const feed = await get('feed-google.xml');
const products = JSON.parse(await get('data/products.json'));
const items = [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)];
const feedIssues = [];
if (items.length !== products.length) feedIssues.push('Cantidad del feed no coincide con catalogo');
for (const [_, item] of items) {
  const id=item.match(/<g:id>([^<]+)<\/g:id>/)?.[1];
  if (!products.some(p=>p.id===id)) feedIssues.push(`ID desconocido ${id}`);
  for (const field of ['title','description','link','image_link','availability','price','identifier_exists']) if (!new RegExp(`<g:${field}>[^<]+<\/g:${field}>`).test(item)) feedIssues.push(`${id}: falta ${field}`);
  if (/\p{Extended_Pictographic}/u.test(item.match(/<g:title>([^<]*)<\/g:title>/)?.[1] || '')) feedIssues.push(`${id}: emoji en el titulo del feed`);
}
const report = {date:new Date().toISOString(), mode:live?'publico':'archivos-locales', pages:urls.length, products:products.length, feedItems:items.length, feedIssues, pagesWithIssues:results.filter(r=>r.issues.length).length, results};
if (out >= 0) await writeFile(path.resolve(process.argv[out+1]), JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ ...report, results:results.filter(r=>r.issues.length)},null,2));
if (report.pagesWithIssues || feedIssues.length) process.exitCode=1;
