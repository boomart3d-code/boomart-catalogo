import {readFile,writeFile,mkdir,stat,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {guides,guideHtml,sizeTables} from './polos-info.mjs';
const require = createRequire(import.meta.url);
const SEO = require('../polos/seo-core.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = text => String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json = value => JSON.stringify(value).replace(/</g,'\\u003c');
const imageManifest=JSON.parse(await readFile(path.join(ROOT,'polos/data/imagenes.json'),'utf8').catch(()=> '{}'));
const image = (p,shot=p.fotos[0],lazy=true,kind='card') => {
  const variants=imageManifest[shot.archivo]||[];
  const sizes=kind==='hero'?'(max-width:700px) 80vw, 420px':kind==='main'?'(max-width:700px) 90vw, 400px':'(max-width:700px) 45vw, 280px';
  const attrs=variants.length?` srcset="${[...variants,[shot.ancho,shot.archivo]].map(([w,f])=>`${esc(f)} ${w}w`).join(', ')}" sizes="${sizes}"`:'';
  return `<img src="${esc(variants.find(([w])=>w>=360)?.[1]||shot.archivo)}"${attrs} alt="${esc(p.nombre+' · '+shot.titulo)}" width="${shot.ancho}" height="${shot.alto}" loading="${lazy?'lazy':'eager'}" decoding="async"${lazy?'':' fetchpriority="high"'}>`;
};
const card = p => `<div class="producto-celda"><a class="producto-card" href="${SEO.productPath(p.id)}"><div class="producto-fotos">${image(p)}</div><p class="producto-precio">S/ ${p.precio}</p><h3>${esc(p.nombre)}</h3><p class="producto-detalle">${esc(p.tema)} · Polo ${esc(p.color)}</p><p class="producto-detalle">Tallas ${p.tallas.map(esc).join(' · ')}</p></a></div>`;
const fill = (html,id,body) => {
  const re = new RegExp(`(<([a-z0-9]+)\\b[^>]*\\bid="${id}"[^>]*>)[\\s\\S]*?<\\/\\2>`,'i');
  if (!re.test(html)) throw new Error('Falta campo de plantilla: '+id);
  return html.replace(re,(_,open,tag)=>`${open}${body}</${tag}>`);
};
export async function buildPolos(root=ROOT) {
  const data = JSON.parse(await readFile(path.join(root,'polos/data/polos.json'),'utf8'));
  const products = data.productos;
  const revision = createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0,12);
  if (!products.length || new Set(products.map(p=>p.id)).size !== products.length) throw new Error('Catálogo de Polos vacío o con IDs repetidos');
  for (const p of products) {
    if (!/^[a-z0-9-]+$/.test(p.id) || !p.fotos?.length || !p.nombre || !p.tema || !(p.precio>0)) throw new Error('Polo incompleto: '+p.id);
    for (const f of p.fotos) {
      const target = path.resolve(root,'polos',f.archivo);
      if (!target.startsWith(path.resolve(root,'polos')+path.sep)) throw new Error('Imagen fuera de Polos');
      await stat(target);
    }
  }
  const template = (await readFile(path.join(root,'polos/plantilla.html'),'utf8')).replace(/\r\n/g,'\n');
  const themes = [...new Set(products.map(p=>p.tema))];
  const portada = JSON.parse(await readFile(path.join(root,'polos/data/portada.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return '{"polos":[]}';throw error;}));
  const pages = [{type:'home',theme:'todos',path:'/polos/'},...themes.map(theme=>({type:'collection',theme,path:SEO.collectionPath(theme)})),...products.map(product=>({type:'product',product,theme:product.tema,path:SEO.productPath(product.id)}))];
  const navigation = `<a href="/polos/">Todos los polos</a>`+themes.map(t=>`<a href="${SEO.collectionPath(t)}">${esc(t)}</a>`).join('');
  const files=[];
  for (const page of pages) {
    const meta = SEO.metadata(page,products);
    const list = page.type === 'product' ? [] : page.type === 'collection' ? products.filter(p=>p.tema===page.theme) : products;
    let html = template.replace('imagenes.js?v=1','imagenes.js?v='+createHash('sha256').update(JSON.stringify(imageManifest)).digest('hex').slice(0,12)).replace('<meta name="robots" content="noindex, nofollow">','<meta name="robots" content="index, follow, max-image-preview:large">').replace('<!-- POLOS:SEO_HEAD -->',`<link rel="canonical" href="${meta.url}">\n  <meta property="og:type" content="${page.product?'product':'website'}">\n  <meta property="og:site_name" content="BoomArt">\n  <meta property="og:title" content="${esc(meta.title)}">\n  <meta property="og:description" content="${esc(meta.description)}">\n  <meta property="og:url" content="${meta.url}">\n  <meta property="og:image" content="${esc(meta.image)}">\n  <meta property="og:image:alt" content="${esc(page.product?.nombre||'Colección de polos BoomArt')}">\n  <meta property="og:locale" content="es_PE">\n  <meta name="twitter:card" content="summary_large_image">\n  <script id="polosSchema" type="application/ld+json">${json(SEO.schemas(page,products))}</script>`)
      .replace(/<title>[\s\S]*?<\/title>/,`<title>${esc(meta.title)}</title>`)
      .replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${esc(meta.description)}">`)
      .replace('<body class="polos-store">',`<body class="polos-store" data-seo-page="${page.type}" data-catalog-revision="${revision}">`);
    html = fill(html,'navColecciones',navigation);
    html = fill(html,'menuColecciones',navigation);
    html = fill(html,'grilla',list.map(card).join('\n'));
    html = fill(html,'resultadoPolos',`${list.length} ${list.length===1?'polo':'polos'}`);
    html = fill(html,'coleccionesPolo',navigation);
    html = fill(html,'guiasCorte',sizeTables(data));
    html = fill(html,'guiasPanel',sizeTables(data));
    const crumbs = `<li><a href="../">BoomArt</a></li><li><a href="/polos/">Polos</a></li>${page.type==='collection'?`<li aria-current="page">${esc(page.theme)}</li>`:''}`;
    html = fill(html,'rutaPagina',crumbs);
    if (page.type==='collection') {
      html=html.replace('<h1 id="tituloPortada">Polos que<br>cuentan historias</h1>','<h2 id="tituloPortada">Polos que<br>cuentan historias</h2>');
      html=html.replace('<h2 id="tituloColeccion">Elige tu diseño</h2>',`<h1 id="tituloColeccion">Polos de ${esc(page.theme)}</h1>`);
      html=fill(html,'introColeccion',esc(SEO.collectionIntro(page.theme)));
    }
    if (page.product) {
      const p=page.product;
      html=html.replace('<main id="app">','<main id="app" hidden>').replace('<footer class="pie">','<footer class="pie" hidden>');
      html=html.replace('<h1 id="tituloPortada">Polos que<br>cuentan historias</h1>','<h2 id="tituloPortada">Polos que<br>cuentan historias</h2>');
      html=html.replace('<dialog id="ficha"','<section data-prerendered="true" id="ficha"').replace('</dialog>','</section>');
      html=html.replace('<h2 id="nombreFicha"></h2>',`<h1 id="nombreFicha">${esc(p.nombre)}</h1>`);
      for (const [id,value] of [['temaFicha',p.tema],['precioFicha',`S/ ${p.precio} por unidad`],['colorFicha',`Polo ${p.color} · Mangas lisas`],['descripcionFicha',p.texto],['materialFicha',p.material]]) html=fill(html,id,esc(value));
      html=fill(html,'tallasFicha',p.tallas.map(s=>`<label><input type="radio" name="tallaFicha" value="${esc(s)}"><span>${esc(s)}</span></label>`).join(''));
      html=fill(html,'fotosFicha',p.fotos.slice(0,4).map((f,i)=>`<a class="ficha-foto" href="${esc(f.archivo)}">${image(p,f,i!==0,'main')}</a>`).join(''));
      html=fill(html,'rutaFicha',`<li><a href="/polos/">Polos</a></li><li><a href="${SEO.collectionPath(p.tema)}">${esc(p.tema)}</a></li><li aria-current="page">${esc(p.nombre)}</li>`);
      const others=products.filter(other=>other.id!==p.id&&other.tema===p.tema).slice(0,4);
      html=fill(html,'parecidosFicha',others.map(p=>`<a class="parecido" href="${SEO.productPath(p.id)}">${image(p)}<p>S/ ${p.precio}</p><h4>${esc(p.nombre)}</h4></a>`).join(''));
      const question='https://wa.me/51925666542?text='+encodeURIComponent(`Hola BoomArt, quiero consultar por el polo ${p.nombre}.`);
      html=html.replace('<!-- POLOS:NOSCRIPT_PRODUCT -->',`<p id="consultaEstatica" class="nota">Tallas ${p.tallas.join(', ')}. <a href="${question}" rel="noopener">Consultar este polo por WhatsApp</a></p>`);
      html=html.replace('<form method="dialog">\n        <button type="submit" class="ficha-volver"',`<form method="dialog">\n        <a data-static-back class="ficha-volver" href="${SEO.collectionPath(p.tema)}">← Volver a ${esc(p.tema)}</a>\n        <button type="submit" class="ficha-volver"`);
    } else if (page.type === 'home') {
      const first=portada.polos?.[0];
      const p=products.find(p=>p.id===first?.id)||list[0], f=p.fotos.find(f=>f.archivo===first?.foto)||p.fotos[0];
      html=fill(html,'vitrinaFotos',`<a class="vitrina-foto actual" href="${SEO.productPath(p.id)}">${image(p,f,false,'hero')}</a>`);
      html=fill(html,'temaDestacado',p.tema);
      html=fill(html,'poloDestacado',p.nombre);
      html=fill(html,'precioDestacado',`S/ ${p.precio}`);
    }
    const file=page.path.slice(1)+'index.html';
    await mkdir(path.dirname(path.join(root,file)),{recursive:true});
    await writeFile(path.join(root,file),'<!-- Generado por scripts/build-polos-seo.mjs desde polos/plantilla.html y polos/data/polos.json. -->\n'+html);
    files.push(file);
  }
  for(const guide of guides){
    const file=`polos/${guide.slug}/index.html`;
    await mkdir(path.dirname(path.join(root,file)),{recursive:true});
    await writeFile(path.join(root,file),guideHtml(guide,data));
    files.push(file);
    pages.push({path:`/polos/${guide.slug}/`});
  }
  // Fuente independiente del catálogo 3D: una oferta por corte y talla real.
  const tag=(name,value)=>`<g:${name}>${esc(value)}</g:${name}>`;
  const items=[];
  for(const p of products)for(const [cut,sizes] of Object.entries(data.medidas))for(const size of p.tallas.filter(s=>sizes[s])){
    const id='bp-'+createHash('sha256').update(p.id).digest('hex').slice(0,16)+'-'+cut+'-'+size.toLowerCase();
    const link=SEO.SITE+SEO.productPath(p.id)+`?corte=${cut}&talla=${size}`;
    const photo=p.fotos.find(f=>cut==='mujer'?/frente.*mujer/i.test(f.titulo):/frente.*hombre/i.test(f.titulo))||p.fotos[0];
    const fields={id,item_group_id:'bp-'+createHash('sha256').update(p.id).digest('hex').slice(0,16),title:`Polo ${p.nombre} - ${cut} - ${size} - ${p.color}`,description:`${p.texto} Algodón pima peinado 20/1. Corte ${cut}, talla ${size}. Se estampa al recibir el pedido; despacho el mismo día o al siguiente de confirmar.`,link,image_link:SEO.absolute(photo.archivo),availability:'in_stock',price:`${p.precio.toFixed(2)} PEN`,condition:'new',brand:'BoomArt',identifier_exists:'no',google_product_category:'212',product_type:`Ropa > Polos > ${p.tema}`,color:p.color,gender:cut==='hombre'?'male':'female',age_group:'adult',size,size_type:'regular',min_handling_time:'0',max_handling_time:'1',return_policy_label:'polos',custom_label_0:'BoomArt Polos'};
    items.push('<item>'+Object.entries(fields).map(([k,v])=>tag(k,v)).join('')+'</item>');
  }
  await writeFile(path.join(root,'polos/feed-google.xml'),`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>BoomArt Polos</title><link>https://boomart.pe/polos/</link><description>Polos de BoomArt por corte y talla</description>${items.join('\n')}</channel></rss>\n`);
  // Solo se retiran páginas generadas en el inventario anterior, dentro de las dos rutas propias.
  let previous=[];
  try {previous=JSON.parse(await readFile(path.join(root,'polos/data/seo-pages.json'),'utf8'));} catch(error) {if(error.code!=='ENOENT')throw error;}
  for (const file of previous.filter(file=>!files.includes(file))) {
    if (!/^polos\/(?:diseno|coleccion)\/[a-z0-9-]+\/index\.html$/.test(file)) throw new Error('Ruta obsoleta no permitida: '+file);
    const target=path.resolve(root,file);
    if (!target.startsWith(path.resolve(root,'polos')+path.sep)) throw new Error('Ruta fuera del proyecto');
    await unlink(target).catch(e=>{if(e.code!=='ENOENT')throw e;});
    await rmdir(path.dirname(target)).catch(e=>{if(!['ENOENT','ENOTEMPTY'].includes(e.code))throw e;});
  }
  await writeFile(path.join(root,'polos/data/seo-pages.json'),JSON.stringify(files,null,2)+'\n');
  const catalog = {marca:'BoomArt',url:SEO.SITE+'/polos/',moneda:'PEN',preparacion:'Prendas base disponibles. Estampado al recibir el pedido; despacho el mismo día o al siguiente de confirmar.',condiciones:SEO.SITE+'/polos/cambios-y-devoluciones/',guia_tallas:SEO.SITE+'/polos/guia-de-tallas/',cuidados:SEO.SITE+'/polos/cuidados/',productos:products.map(p=>({id:p.id,nombre:p.nombre,url:SEO.SITE+SEO.productPath(p.id),coleccion:p.tema,color:p.color,tallas:p.tallas,precio:p.precio,descripcion:p.texto,material:p.material,imagenes:p.fotos.map(f=>SEO.absolute(f.archivo))}))};
  await writeFile(path.join(root,'polos/catalogo.json'),JSON.stringify(catalog,null,2)+'\n');
  const summary=`## BoomArt Polos\n\nPolos de Saint Seiya, Dragon Ball, Harry Potter y Legend of Zelda. Tallas S, M y L; precios en soles (PEN). Entrega y disponibilidad se coordinan con BoomArt.\n\n- [Tienda de polos](${SEO.SITE}/polos/): ${products.length} diseños con fotos y precios.\n- [Catálogo de polos en JSON](${SEO.SITE}/polos/catalogo.json).\n- [Catálogo de polos en texto](${SEO.SITE}/polos/llms.txt).\n${themes.map(t=>`- [Polos de ${t}](${SEO.SITE+SEO.collectionPath(t)}).`).join('\n')}\n`;
  const full=summary+'\n'+products.map(p=>`### Polo ${p.nombre}\n\n${p.texto}\n\n- Colección: ${p.tema}\n- Precio publicado: PEN ${p.precio.toFixed(2)}\n- Tallas: ${p.tallas.join(', ')}\n- Color: ${p.color}\n- Material: ${p.material}\n- Ver diseño: ${SEO.SITE+SEO.productPath(p.id)}\n`).join('\n');
  const info='\n## Preparación y condiciones de Polos\n\nPrendas base disponibles, estampadas al recibir el pedido. Despacho el mismo día o al siguiente de confirmar para todos los diseños y tallas. La llegada depende del courier. Cambios y devoluciones por preferencia: solicitar dentro de las 24 horas de recibir, sin uso, sin lavar, en buen estado y con etiqueta; transporte a cargo del cliente. Fallas de fábrica o error de BoomArt: recambio o devolución del dinero, con transporte correspondiente a cargo de BoomArt, sin limitar los derechos legales del consumidor. Reembolso aceptado: hasta 3 días hábiles tras aceptar la devolución y recibir la prenda.\n\n'+guides.map(g=>`- [${g.title}](${SEO.SITE}/polos/${g.slug}/).`).join('\n')+'\n';
  await writeFile(path.join(root,'polos/llms.txt'),'# BoomArt Polos\n\n'+full+info);
  return {files,summary:summary+info,full:full+info,sitemap:pages.map(p=>({loc:SEO.SITE+p.path,priority:p.product?'0.7':'0.8',changefreq:'weekly'}))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=await buildPolos();
  console.log(`Polos: ${result.files.length} páginas HTML, catálogo JSON y texto generados.`);
}
