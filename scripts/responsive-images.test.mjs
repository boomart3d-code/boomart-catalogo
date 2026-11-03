import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import imageTools from '../src/responsive-images.js';
import { responsiveHtml } from './responsive-html.mjs';
const images = imageTools.createImages({
  'assets/products/a.webp': { w: 1122, h: 1402, src: 'assets/products/a.webp', v: [[120,'assets/responsive/a-120.webp'],[360,'assets/responsive/a-360.webp'],[720,'assets/responsive/a-720.webp']] },
  'assets/products/b.webp': { w: 600, h: 800, src: 'assets/products/b.jpg', v: [[120,'assets/responsive/b-120.webp'],[360,'assets/responsive/b-360.webp']] },
});
test('miniaturas, tarjetas y foto principal solicitan anchos adecuados sin perder el original',()=>{
  assert.equal(images.attributes('assets/products/a.jpg','thumb').src,'assets/responsive/a-120.webp');
  assert.equal(images.attributes('assets/products/a.jpg','card').src,'assets/responsive/a-360.webp');
  assert.equal(images.attributes('assets/products/a.jpg','main').src,'assets/responsive/a-720.webp');
  assert.match(images.attributes('assets/products/a.jpg').srcset,/assets\/products\/a.webp 1122w/);
});
test('rutas relativas de ficha, absolutas de la web y consultas conservan su destino',()=>{
  assert.equal(images.attributes('../../assets/products/a.png?v=2','thumb').src,'../../assets/responsive/a-120.webp');
  assert.equal(images.attributes('https://boomart.pe/assets/products/a.jpg','main').src,'https://boomart.pe/assets/responsive/a-720.webp');
});
test('no sustituir recursos externos o fotos aun no generadas por archivos inexistentes',()=>{
  assert.deepEqual(images.attributes('https://other.test/assets/products/a.jpg'),{src:'https://other.test/assets/products/a.jpg'});
  assert.deepEqual(images.attributes('assets/products/nueva.jpg'),{src:'assets/products/nueva.jpg'});
  assert.equal(images.attributes('assets/products/b.jpg','main').src,'assets/products/b.jpg');
});
test('cambiar imagen actualiza srcset y elimina el anterior si la nueva no tiene derivados',()=>{
  const attributes={};const img={setAttribute:(k,v)=>attributes[k]=v,removeAttribute:k=>delete attributes[k]};
  images.apply(img,'assets/products/a.jpg','main');assert.match(attributes.srcset,/a-720/);
  images.apply(img,'assets/products/b.jpg','main');assert.doesNotMatch(attributes.srcset,/a-720/);
  images.apply(img,'otra.jpg','main');assert.equal(img.src,'otra.jpg');assert.equal(attributes.srcset,undefined);
});
test('HTML regenerado mantiene miniaturas separadas de la foto y no acumula atributos ni scripts',()=>{
  const source='<html><head></head><body><img src="../../assets/boomart-logo.svg"><img id="ppMain" src="../../assets/products/skins-zelda-nintendo-switch-2-hero-v2.webp" width="640" height="640"><img src="../../assets/products/skins-zelda-nintendo-switch-2-11-disenos-v2.webp" width="62" height="62"><script>void 0</script></body></html>';
  const result=responsiveHtml(source);
  assert.match(result,/fetchpriority="high"/);assert.match(result,/11-disenos-v2-[a-f0-9]+-120w.webp/);
  assert.match(result,/src="\.\.\/\.\.\/src\/responsive-images.js\?v=1"/);
  assert.equal(responsiveHtml(result),result);
  assert.equal((result.match(/src\/responsive-images.js/g)||[]).length,1);
});
test('portada publicada incluye los helpers antes de app y fotos adaptables desde HTML', async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m=>m[1]);
  const at=name=>scripts.findIndex(src=>src.startsWith('src/'+name));
  assert.ok(at('image-sources.js')>=0 && at('image-sources.js')<at('responsive-images.js'));
  assert.ok(at('responsive-images.js')<at('app.js'));
  assert.match(html, /id="v2HeroImage"[^>]+srcset=/);
  assert.match(html, /id="v2HeroProduct"[^>]+data-open="busto-de-atena-saint-seiya"/);
  assert.equal(responsiveHtml(html),html);
});
