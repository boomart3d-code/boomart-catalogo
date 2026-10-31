/* Misma seleccion de fotos en el generador HTML y en la tienda interactiva. */
(function (root) {
  function createImages(manifest) {
    const sizes = {
      thumb: '(max-width: 600px) 52px, 62px',
      card: '(max-width: 700px) calc((100vw - 42px) / 2), (max-width: 1100px) 30vw, 280px',
      main: '(max-width: 720px) calc(100vw - 28px), 640px',
      hero: '(max-width: 600px) 50vw, 400px',
      tile: '(max-width: 600px) 128px, 180px',
      related: '(max-width: 600px) 140px, 180px',
    };
    function resolve(src) {
      const match = String(src || '').match(/^(.*?)(assets\/(?:products|hero)\/[^?#]+)([?#].*)?$/);
      if (!match || (match[1].includes('://') && !/^https:\/\/boomart\.pe\/$/.test(match[1]))) return null;
      const key = match[2].replace(/\.(jpe?g|png)$/i, '.webp');
      return manifest[key] ? { item: manifest[key], prefix: match[1] } : null;
    }
    function attributes(src, kind = 'card') {
      const found = resolve(src);
      if (!found) return { src: String(src || '') };
      const { item, prefix } = found;
      const target = kind === 'thumb' ? 120 : kind === 'main' ? 720 : 360;
      const variants = [...item.v, [item.w, item.src]].sort((a, b) => a[0] - b[0]);
      const fallback = variants.find(([w]) => w >= target) || variants.at(-1);
      return {
        src: prefix + fallback[1],
        srcset: variants.map(([w, file]) => `${prefix}${file} ${w}w`).join(', '),
        sizes: sizes[kind] || sizes.card,
        width: item.w,
        height: item.h,
      };
    }
    function html(src, kind = 'card') {
      const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      return Object.entries(attributes(src, kind)).map(([key, value]) => `${key}="${esc(value)}"`).join(' ');
    }
    function apply(img, src, kind = 'main') {
      const attrs = attributes(src, kind);
      // Cambiar de variante nunca conserva el srcset de la foto anterior.
      for (const key of ['srcset', 'sizes', 'width', 'height']) {
        if (attrs[key] == null) img.removeAttribute(key);
        else img.setAttribute(key, attrs[key]);
      }
      img.src = attrs.src;
    }
    return { attributes, html, apply };
  }
  if (typeof module === 'object' && module.exports) module.exports = { createImages };
  else root.BoomArtImages = createImages(root.BOOMART_IMAGE_SOURCES || {});
})(typeof globalThis === 'object' ? globalThis : this);
