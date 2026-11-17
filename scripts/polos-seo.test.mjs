import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {buildPolos} from './build-polos-seo.mjs';
import {changedUrls,sitemapUrls} from './indexnow.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const SEO=require('../polos/seo-core.js');
const data=JSON.parse(await readFile(path.join(ROOT,'polos/data/polos.json'),'utf8'));
const pages=JSON.parse(await readFile(path.join(ROOT,'polos/data/seo-pages.json'),'utf8'));
const read=file=>readFile(path.join(ROOT,file),'utf8');
const text=html=>html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/g,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
const schema=html=>JSON.parse(html.match(/<script id="polosSchema" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

test('todos los enlaces anteriores conservan el diseño o la colección al pasar a URL propia',()=>{
  for(const p of data.productos){
    assert.equal(SEO.route('https://boomart.pe/polos/#/p/'+p.id,data.productos).path,SEO.productPath(p.id));
    assert.equal(SEO.route('https://boomart.pe'+SEO.productPath(p.id),data.productos).product.id,p.id);
    assert.equal(SEO.route('https://boomart.pe/polos/#/c/'+SEO.slug(p.tema),data.productos).path,SEO.collectionPath(p.tema));
  }
  assert.equal(SEO.route('https://boomart.pe/polos/#/c/todos',data.productos).path,'/polos/');
});

test('el HTML inicial de la tienda contiene los 18 diseños y sus enlaces sin ejecutar JS',async()=>{
  const html=await read('polos/index.html');
  const visible=text(html);
  assert.equal((html.match(/class="producto-card"/g)||[]).length,data.productos.length);
  for(const p of data.productos){assert.ok(visible.includes(p.nombre));assert.ok(html.includes('href="'+SEO.productPath(p.id)+'"'));}
  assert.doesNotMatch(html,/<meta name="robots" content="[^"]*noindex/);
  assert.ok(html.includes('data-catalog-revision="'+createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0,12)+'"'));
});

test('cada ficha ofrece precio, descripción, talla y fotos en HTML visible, con schema consistente',async()=>{
  for(const p of data.productos){
    const html=await read(SEO.productPath(p.id).slice(1)+'index.html');
    assert.match(html,/<section data-prerendered="true" id="ficha"/);
    assert.ok(html.includes('<h1 id="nombreFicha">'+p.nombre+'</h1>'));
    assert.ok(text(html).includes(p.texto));
    const product=schema(html)['@graph'].find(n=>n['@type']==='Product');
    assert.equal(product.offers.price,p.precio);assert.equal(product.offers.priceCurrency,'PEN');
    assert.equal(product.description,p.texto);assert.deepEqual(product.size,p.tallas);
    assert.ok(product.image.length>0);assert.ok(!product.aggregateRating);assert.ok(!product.offers.availability);
    assert.ok(html.includes('Consultar este polo por WhatsApp'));
  }
});

test('las colecciones incluyen solo los diseños correspondientes y títulos independientes',async()=>{
  const titles=new Set();
  for(const theme of new Set(data.productos.map(p=>p.tema))){
    const html=await read(SEO.collectionPath(theme).slice(1)+'index.html');
    const list=schema(html)['@graph'].find(n=>n['@type']==='ItemList');
    const expected=data.productos.filter(p=>p.tema===theme);
    assert.deepEqual(list.itemListElement.map(p=>p.url),expected.map(p=>SEO.SITE+SEO.productPath(p.id)));
    assert.match(html,/<h1 id="tituloColeccion">Polos de /);
    titles.add(html.match(/<title>(.*?)<\/title>/)[1]);
  }
  assert.equal(titles.size,4);
});

test('sitemap e IndexNow descubren las páginas reales de Polos; nunca fragmentos',async()=>{
  const urls=sitemapUrls(await read('sitemap.xml'));
  const polos=urls.filter(u=>new URL(u).pathname.startsWith('/polos/'));
  assert.equal(polos.length,pages.length);
  assert.equal(new Set(polos).size,polos.length);
  assert.equal(changedUrls(pages,urls).length,pages.length);
  for(const p of pages){const html=await read(p);const url=SEO.SITE+'/'+p.replace(/index\.html$/,'');assert.ok(html.includes('<link rel="canonical" href="'+url+'">'));assert.ok(urls.includes(url));}
});

test('los recursos de IA incluyen nombres, precios y URL reales, sin datos de manga obsoletos',async()=>{
  const catalog=JSON.parse(await read('polos/catalogo.json'));
  assert.equal(catalog.productos.length,data.productos.length);
  const full=await read('llms-full.txt');
  assert.ok((await read('llms.txt')).includes('## BoomArt Polos'));
  for(const p of data.productos){assert.ok(full.includes(SEO.SITE+SEO.productPath(p.id)));assert.ok(p.texto.includes('Mangas lisas'));}
  assert.doesNotMatch((await read('polos/llms.txt')),/(?:emblema|logotipo|estandarte|insignia|Kedavra) en la manga/i);
});

async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),'boomart-polos-seo-'));
  await mkdir(path.join(root,'polos/data'),{recursive:true});
  await writeFile(path.join(root,'polos/plantilla.html'),await read('polos/plantilla.html'));
  const products=data.productos.slice(0,2).map(p=>({...p,fotos:[{archivo:'img/'+p.id+'.webp',titulo:'Vista principal',ancho:600,alto:800}]}));
  await mkdir(path.join(root,'polos/img'),{recursive:true});
  for(const p of products)await writeFile(path.join(root,'polos',p.fotos[0].archivo),'fixture');
  await writeFile(path.join(root,'polos/data/polos.json'),JSON.stringify({...data,productos:products}));
  return {root,products};
}

test('regenerar es estable y retirar un diseño limpia únicamente sus páginas inventariadas',async()=>{
  const {root,products}=await fixture();
  const first=await buildPolos(root);
  const hash=async()=>createHash('sha256').update((await Promise.all(first.files.map(f=>readFile(path.join(root,f))))).map(b=>b.toString()).join('')).digest('hex');
  const before=await hash();await buildPolos(root);assert.equal(await hash(),before);
  await writeFile(path.join(root,'polos/no-tocar.html'),'manual');
  await writeFile(path.join(root,'polos/data/polos.json'),JSON.stringify({...data,productos:[products[0]]}));
  await buildPolos(root);
  await assert.rejects(stat(path.join(root,SEO.productPath(products[1].id).slice(1),'index.html')),{code:'ENOENT'});
  assert.equal(await readFile(path.join(root,'polos/no-tocar.html'),'utf8'),'manual');
});

test('el generador rechaza rutas de imagen y retiros fuera de sus carpetas',async()=>{
  const {root,products}=await fixture();
  await writeFile(path.join(root,'polos/data/polos.json'),JSON.stringify({...data,productos:[{...products[0],fotos:[{archivo:'../../secreto.txt'}]}]}));
  await assert.rejects(buildPolos(root),/Imagen fuera de Polos/);
  await writeFile(path.join(root,'polos/data/polos.json'),JSON.stringify({...data,productos:[products[0]]}));
  await writeFile(path.join(root,'polos/data/seo-pages.json'),JSON.stringify(['../../archivo-ajeno.html']));
  await assert.rejects(buildPolos(root),/Ruta obsoleta no permitida/);
});
