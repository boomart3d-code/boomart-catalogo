import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import imageTools from '../src/responsive-images.js';

const manifest = JSON.parse(await readFile(new URL('../assets/responsive/manifest.json', import.meta.url), 'utf8').catch(() => '{}'));
const images = imageTools.createImages(manifest);
const revision = createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0, 12);
export function responsiveHtml(html) {
  if (!Object.keys(manifest).length) return html;
  html = html.replace(/(src="[^"]*src\/image-sources.js\?v=)[^"]+/g, '$1' + revision);
  const brand = html.match(/\bsrc="([^"]*?)assets\/boomart-logo/);
  const prefix = brand?.[1] || '';
  html = html.replace(/<img\b[^>]*>/gi, tag => {
    // Guardar la fuente permite regenerar tambien index.html sin encadenar derivados.
    const source = tag.match(/\sdata-image-source="([^"]+)"/)?.[1] || tag.match(/\ssrc="([^"]+)"/)?.[1];
    if (!source) return tag;
    const kind = tag.match(/\sdata-image-kind="([^"]+)"/)?.[1] || (/id="ppMain"/.test(tag) ? 'main'
      : /hero-reel-photo|id="v2HeroImage"/.test(tag) ? 'hero'
      : /\/hero\/tile-/.test(source) ? 'tile'
      : /\bwidth="(?:52|62)"/.test(tag) ? 'thumb'
      : /\bwidth="(?:128|160|180)"/.test(tag) ? 'related' : 'card');
    if (!images.attributes(source, kind).srcset) return tag;
    let clean = tag.replace(/\s(?:src|srcset|sizes|width|height|data-image-source|data-image-kind)="[^"]*"/g, '');
    if (kind === 'main' && !/fetchpriority=/.test(clean)) clean = clean.replace(/>$/, ' fetchpriority="high">');
    return clean.replace(/>$/, ` ${images.html(source, kind)} data-image-source="${source}" data-image-kind="${kind}">`);
  });
  // Antes de los scripts de la ficha y de app.js; la foto principal ya esta en HTML.
  if (!html.includes('src/responsive-images.js')) {
    const helpers = `<script src="${prefix}src/image-sources.js?v=${revision}"></script>\n    <script src="${prefix}src/responsive-images.js?v=1"></script>\n    `;
    const body = html.indexOf('<body');
    const at = html.indexOf('<script', body);
    html = at >= 0 ? html.slice(0, at) + helpers + html.slice(at) : html.replace('</body>', helpers + '</body>');
  }
  return html;
}
