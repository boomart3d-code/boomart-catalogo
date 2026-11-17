/* Una misma identidad y URL para HTML inicial, navegación y datos estructurados. */
(function (root) {
  'use strict';
  const SITE = 'https://boomart.pe';
  const slug = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const collectionPath = theme => !theme || theme === 'todos' ? '/polos/' : '/polos/coleccion/' + slug(theme) + '/';
  const productPath = id => '/polos/diseno/' + id + '/';
  const absolute = value => new URL(value, SITE + '/polos/').href;
  function route(url, products) {
    const u = new URL(url, SITE);
    const legacyProduct = u.hash.match(/^#\/p\/([a-z0-9-]+)(?:\/probador)?$/);
    const legacyCollection = u.hash.match(/^#\/c\/([a-z0-9-]+)$/);
    const productId = legacyProduct?.[1] || u.pathname.match(/^\/polos\/diseno\/([a-z0-9-]+)\/(?:index\.html)?$/)?.[1];
    const collection = legacyCollection?.[1] || u.pathname.match(/^\/polos\/coleccion\/([a-z0-9-]+)\/(?:index\.html)?$/)?.[1];
    const product = products.find(p => p.id === productId);
    if (product) return {type:'product', product, theme:product.tema, path:productPath(product.id)};
    const theme = [...new Set(products.map(p => p.tema))].find(t => slug(t) === collection);
    return theme ? {type:'collection', theme, path:collectionPath(theme)} : {type:'home', theme:'todos', path:'/polos/'};
  }
  function metadata(page, products) {
    const p = page.product;
    const title = p ? `Polo ${p.nombre} | BoomArt Perú` : page.type === 'collection' ? `Polos de ${page.theme} en Perú | BoomArt` : 'Polos de anime y fantasía en Perú | BoomArt';
    const description = p ? `${p.texto} Color ${p.color}. Tallas ${p.tallas.join(', ')}. Precio S/ ${p.precio}. Envíos a todo el Perú.` : page.type === 'collection' ? `Explora los polos de ${page.theme} de BoomArt. Fotos, diseños, tallas S, M y L y precios en soles. Envíos a todo el Perú.` : 'Polos de Saint Seiya, Dragon Ball, Harry Potter y Zelda. Explora diseños, fotos, tallas S, M y L y precios en soles. Envíos a todo el Perú.';
    const items = page.type === 'collection' ? products.filter(x => x.tema === page.theme) : products;
    const photo = p?.fotos[0] || items[0]?.fotos[0];
    return {title, description, url:SITE + page.path, image:photo ? absolute(photo.archivo) : SITE + '/assets/boomart-og.jpg'};
  }
  function schemas(page, products) {
    const meta = metadata(page, products);
    const crumbs = [{name:'BoomArt', item:SITE+'/'}, {name:'Polos', item:SITE+'/polos/'}];
    if (page.theme !== 'todos') crumbs.push({name:page.theme, item:SITE+collectionPath(page.theme)});
    if (page.product) crumbs.push({name:page.product.nombre, item:meta.url});
    const graph = [
      {'@type':page.product ? 'ItemPage' : 'CollectionPage', '@id':meta.url+'#webpage', url:meta.url, name:meta.title, description:meta.description, inLanguage:'es-PE', isPartOf:{'@id':SITE+'/#website'}},
      {'@type':'BreadcrumbList', itemListElement:crumbs.map((c,i)=>({'@type':'ListItem',position:i+1,...c}))}
    ];
    if (page.product) {
      const p = page.product;
      const product = {'@type':'Product','@id':meta.url+'#product',url:meta.url,name:'Polo '+p.nombre,description:p.texto,image:p.fotos.slice(0,4).map(f=>absolute(f.archivo)),brand:{'@type':'Brand',name:'BoomArt'},color:p.color,material:p.material,size:p.tallas};
      if (Number.isFinite(p.precio) && p.precio > 0) product.offers = {'@type':'Offer',url:meta.url,price:p.precio,priceCurrency:'PEN',itemCondition:'https://schema.org/NewCondition',seller:{'@id':SITE+'/#store'}};
      graph[0].mainEntity = {'@id':product['@id']};
      graph.push(product);
    } else {
      const list = page.type === 'collection' ? products.filter(p=>p.tema===page.theme) : products;
      graph.push({'@type':'ItemList',numberOfItems:list.length,itemListElement:list.map((p,i)=>({'@type':'ListItem',position:i+1,name:'Polo '+p.nombre,url:SITE+productPath(p.id)}))});
    }
    return {'@context':'https://schema.org','@graph':graph};
  }
  const api = {SITE,slug,collectionPath,productPath,absolute,route,metadata,schemas};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BoomartPolosSEO = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
