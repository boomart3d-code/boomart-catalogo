/* Propuesta V2 local: composición móvil y colecciones con identidad. */
(() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const themes = {
    'Saint Seiya': { short:'Saint Seiya', title:'Vuelve a encender<br><em>tu cosmos.</em>', copy:'Templos, esculturas y piezas para quienes llevan el Santuario en la memoria.', image:'assets/hero/busto-de-atena.webp', tone:'cosmos', ids:['set-santuario-15-piezas','busto-de-atena-saint-seiya','casco-de-pegaso-saint-seiya','diorama-de-pegaso'], audio:'assets/audio/saint-seiya-demo.mp3', track:'Pegasus Fantasy · muestra' },
    'Harry Potter': {short:'Harry Potter',title:'Un lugar para<br><em>la magia.</em>',copy:'Piezas para hacer de tu espacio un rincón de tu universo favorito.',image:'assets/hero/fawkes.webp',tone:'magic'},
    'Marvel & DC': {short:'Marvel y DC',title:'Fuera de la pantalla.<br><em>Dentro de tu mundo.</em>',copy:'Cascos, personajes y piezas para tu lado más fan.',image:'assets/hero/dr-doom-cutout-v2.webp',tone:'heroes'},
    'Navidad': {short:'Navidad',title:'Los detalles<br><em>nos reúnen.</em>',copy:'Piezas para compartir la mesa, las historias y la magia de estar juntos.',image:'assets/hero/santa-cutout-v2.webp',tone:'christmas',ids:['tazon-de-galletas-santa','bandeja-dulces-arbol-navideno','belen-iluminado']},
    '🎃 Halloween': {short:'Cosplay',title:'Entra en<br><em>personaje.</em>',copy:'Cascos, máscaras y accesorios para llevar tu universo favorito más allá de la pantalla.',image:'assets/hero/casco-del-mandaloriano.webp',tone:'cosplay',ids:['casco-del-mandaloriano','mascara-hellboy-articulada','casco-de-wolverine-con-garras','casco-daredevil']},
    'Zelda': {short:'Zelda',title:'Tu aventura<br><em>continúa aquí.</em>',copy:'Piezas para llevar un poco de Hyrule a tu espacio.',image:'assets/hero/escudo-zelda-cutout-v2.webp',tone:'hyrule',ids:['mascara-majora','espada-zelda','escudo-zelda','skins-zelda-nintendo-switch-2'],audio:'assets/audio/zelda-demo.mp3',track:'Ocarina of Time · muestra'},
    'Macetas':{short:'Macetas',title:'Dale vida<br><em>a tu espacio.</em>',copy:'Personajes y formas para acompañar tu rincón favorito.',image:'assets/hero/maceta-groot.webp',tone:'plants'},
    'Mundial de Fútbol':{short:'Mundial de Fútbol',title:'La pasión<br><em>tiene su lugar.</em>',copy:'Piezas que celebran el fútbol y los momentos que recordamos.',image:'assets/hero/tile-mundial.webp',tone:'football'},
    'Soportes de Mandos':{short:'Soportes de mandos',title:'Dale carácter<br><em>a tu setup.</em>',copy:'Un lugar para tus mandos y para lo que te gusta jugar.',image:'assets/hero/soporte-picoro-cutout-v3.webp',tone:'gaming',notice:'Mando de referencia. No incluido.',ids:['soporte-mando-picoro','soporte-mando-deadpool','soporte-mando-wolverine','soporte-mando-majin-buu']},
    'Figuras Coleccionables':{short:'Figuras coleccionables',title:'Haz espacio<br><em>a tus favoritos.</em>',copy:'Piezas con carácter para una colección tan personal como tú.',image:'assets/hero/tile-series-peliculas.webp',tone:'figures'}
  };
  let type = 'Todos', order = 'featured', category = '', heroIndex = 0, heroPaused = false;
  const audio = new Audio(); audio.preload = 'none'; audio.loop = true; audio.volume = .14;
  const image = (src, kind='card') => window.BoomArtImages.html(src.replace(/\.(png|jpe?g)$/i,'.webp'),kind);
  const belongs = (p,c) => c === '🎃 Halloween' ? HALLOWEEN_CAMPAIGN_ORDER.has(p.id) : p.category === c || (p.extraCategories || []).includes(c);
  function selection(list,c) { const ids=themes[c]?.ids || [];return list.filter(p=>belongs(p,c)).sort((a,b)=>{const ai=ids.indexOf(a.id),bi=ids.indexOf(b.id);return (ai<0?999:ai)-(bi<0?999:bi) || Number(!!b.featured)-Number(!!a.featured);}); }
  function audioLabel() { const button=document.querySelector('[data-ambient]'); if(button){button.setAttribute('aria-pressed',String(!audio.paused));button.innerHTML=`<span aria-hidden="true">${audio.paused?'♫':'Ⅱ'}</span> ${audio.paused?'Activar ambiente':'Pausar ambiente'}`;} }
  function stopAudio(){audio.pause();audioLabel();}
  const api = window.BoomV2 = {
    label(c){return themes[c]?.short;},
    reset(){type='Todos';order='featured';},
    compare(a,b){const price=p=>p.signPicker?.unitPrice??p.templePricing?.temple??p.regularPrice??0;if(order==='low')return price(a)-price(b);if(order==='high')return price(b)-price(a);const ids=themes[activeFilter]?.ids||[],rank=p=>{const i=ids.indexOf(p.id);return i<0?999:i;};return rank(a)-rank(b)||Number(!!b.featured)-Number(!!a.featured);},
    matches(p){const n=p.name.toLowerCase();return type==='Todos'||(type==='Templos'&&/templo|santuario|pandora/.test(n))||(type==='Esculturas'&&/busto|escultura|altar|reloj/.test(n))||(type==='Cascos y tiaras'&&/casco|tiara/.test(n));},
    home(list,card,label,categories){
      const directory=categories.map((c,i)=>{const selected=selection(list,c),p=selected[0],t=themes[c]||{};return `<button type="button" class="v2-universe" data-filter="${esc(c)}" data-scroll data-tone="${t.tone||'figures'}"><span class="v2-universe-number">${String(i+1).padStart(2,'0')}</span><span class="v2-universe-art"><img ${image(t.image||p.image,'tile')} alt="" loading="lazy" decoding="async"></span><span class="v2-universe-label"><strong>${esc(t.short||label(c))}</strong><small>${selected.length} piezas <span aria-hidden="true">↗</span></small></span></button>`;}).join('');
      const rows=['Saint Seiya','Navidad','Zelda'].map((c,i)=>{const t=themes[c];return `<section class="v2-edit" data-tone="${t.tone}"><div class="v2-edit-intro"><span class="v2-kicker">${i===1?'PARA COMPARTIR':'UN UNIVERSO POR DESCUBRIR'}</span><h3>${t.title}</h3><p>${t.copy}</p><button type="button" data-filter="${esc(c)}" data-scroll class="v2-text-link">Explorar ${esc(t.short)} <span aria-hidden="true">↗</span></button></div><div class="showcase-track v2-products" tabindex="0" aria-label="Selección de ${esc(t.short)}">${selection(list,c).slice(0,4).map(card).join('')}</div></section>`;}).join('');
      return `<div class="v2-directory" aria-label="Todas las colecciones">${directory}</div><div class="v2-craft"><span>DISEÑADO PARA TI</span><p>De la afición a la pieza.<br><strong>Hecho a pedido, aquí en Perú.</strong></p><a href="#personalizado">Tengo una idea ↗</a></div>${rows}<div class="v2-all"><span>Tu próxima pieza puede estar aquí.</span><button type="button" data-filter="Todos" data-scroll>Ver todos los productos ↗</button></div>`;
    },
    context(c,home,count){
      document.body.dataset.view=home?'home':c==='Todos'?'all':'category';
      let header=document.querySelector('#v2Category');if(!header){header=document.createElement('div');header.id='v2Category';document.querySelector('.catalog-head').before(header);}
      header.hidden=home||c==='Todos';
      if(category!==c||home){stopAudio();category=home?'':c;header.innerHTML='';}
      const t=themes[c]||{};
      document.querySelector('#searchInput').placeholder=home?'Encuentra tu próxima pieza…':c==='Todos'?'Buscar en todo el catálogo…':`Buscar en ${t.short||c}…`;
      if(!header.hidden&&!header.children.length){const p=products.find(p=>p.category===c),src=t.image||p?.image;header.dataset.tone=t.tone||'figures';header.innerHTML=`<div class="v2-category-copy"><button type="button" data-v2-home class="v2-breadcrumb">Inicio / Colecciones <span aria-hidden="true">↗</span></button><p class="v2-kicker">${esc(t.short||c)}</p><h1>${t.title||esc(c)}</h1><p>${esc(t.copy||'Piezas hechas a pedido para tu colección.')}</p>${t.notice?`<small class="v2-product-notice">${esc(t.notice)}</small>`:''}${t.audio?`<div class="v2-ambient"><button type="button" data-ambient aria-pressed="false"><span aria-hidden="true">♫</span> Activar ambiente</button><small>${esc(t.track)} · volumen suave</small><span role="status" id="v2AudioStatus"></span></div>`:''}</div><div class="v2-category-art"><img ${image(src,'main')} alt="${esc(t.short||c)}" decoding="async"></div>`;}
      let tools=document.querySelector('#v2Tools');if(!tools){tools=document.createElement('div');tools.id='v2Tools';document.querySelector('#productGrid').before(tools);}
      tools.hidden=home;
      tools.innerHTML=home?'':`<div class="v2-type-list" aria-label="Tipo de pieza">${(c==='Saint Seiya'?['Todos','Templos','Esculturas','Cascos y tiaras']:[]).map(x=>`<button type="button" data-v2-type="${x}" aria-pressed="${x===type}">${x}</button>`).join('')}</div><div class="v2-sort"><span>${count} piezas</span><label>Ordenar <select id="v2Sort"><option value="featured"${order==='featured'?' selected':''}>Destacados</option><option value="low"${order==='low'?' selected':''}>Menor precio</option><option value="high"${order==='high'?' selected':''}>Mayor precio</option></select></label></div>`;
      const typeList=tools.querySelector('.v2-type-list'),selectedType=typeList?.querySelector('[aria-pressed="true"]');
      if(selectedType)requestAnimationFrame(()=>{if(selectedType.isConnected&&typeList.scrollWidth>typeList.clientWidth){const item=selectedType.getBoundingClientRect(),row=typeList.getBoundingClientRect();typeList.scrollLeft+=item.left-row.left-(row.width-item.width)/2;}});
      document.querySelector('#catalogTitle').textContent=home?'Encuentra tu universo.':c==='Todos'?'Todas las piezas':`La colección ${t.short||c}`;
    }
  };
  // Una fotografía secundaria se pide cuando existe intención de verla.
  for(const event of ['pointerover','focusin'])document.addEventListener(event,e=>{if(event==='pointerover'&&e.pointerType==='touch')return;const img=e.target.closest('.card-media')?.querySelector('img[data-alt-src]');if(img){img.addEventListener('load',()=>img.classList.add('is-ready'),{once:true});window.BoomArtImages.apply(img,img.dataset.altSrc,'card');img.removeAttribute('data-alt-src');}});
  document.addEventListener('click',async e=>{
    if(e.target.closest('[data-v2-home]')){document.querySelector('#clearFilters').click();window.scrollTo({top:0,behavior:'smooth'});}
    const filter=e.target.closest('[data-v2-type]');if(filter){type=filter.dataset.v2Type;renderProducts();document.querySelector('.v2-type-list [aria-pressed="true"]')?.focus({preventScroll:true});}
    if(e.target.closest('[data-ambient]')){const t=themes[category];if(!t?.audio)return;if(!audio.paused){stopAudio();return;}if(!audio.src.endsWith(t.audio))audio.src=t.audio;try{await audio.play();audioLabel();}catch{document.querySelector('#v2AudioStatus').textContent='No se pudo iniciar. Toca para reintentar.';audioLabel();}}
    const slide=e.target.closest('[data-v2-slide]');if(slide){showSlide(Number(slide.dataset.v2Slide));heroPaused=true;updatePause();}
  });
  document.addEventListener('change',e=>{if(e.target.id==='v2Sort'){order=e.target.value;renderProducts();document.querySelector('#v2Sort')?.focus({preventScroll:true});}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAudio();});
  const drawer=document.querySelector('#cartDrawer');if(drawer)new MutationObserver(()=>{if(!drawer.hidden)stopAudio();}).observe(drawer,{attributes:true,attributeFilter:['hidden']});
  const logo=document.querySelector('.quick-nav-logo');logo.innerHTML='<img src="assets/boomart-logo.svg" alt="BoomArt" width="80" height="40">';logo.addEventListener('click',e=>{e.preventDefault();document.querySelector('#clearFilters').click();window.scrollTo({top:0,behavior:'smooth'});});
  const account=document.querySelector('#accountToggle');document.querySelector('.quick-nav-actions').insertBefore(account,document.querySelector('#cartFloatToggle'));
  const coupon=document.querySelector('#couponBanner');document.querySelector('#portada').after(coupon);
  const slides=[
    {k:'COLECCIÓN SAINT SEIYA',h:'El cosmos<br><em>cobra forma.</em>',p:'Piezas que hacen espacio a lo que te apasiona.',c:'Saint Seiya',src:'assets/hero/busto-de-atena.webp',alt:'Busto de Atena de Saint Seiya',caption:'Busto de Atena · Saint Seiya',tone:'cosmos',product:'busto-de-atena-saint-seiya'},
    {k:'NAVIDAD EN BOOMART',h:'Los detalles<br><em>nos reúnen.</em>',p:'Haz espacio a los momentos compartidos.',c:'Navidad',src:'assets/hero/santa-cutout-v2.webp',alt:'Tazón de galletas Santa de BoomArt',caption:'Tazón de galletas Santa · Navidad',tone:'christmas',product:'tazon-de-galletas-santa'},
    {k:'COLECCIÓN ZELDA',h:'Tu aventura<br><em>continúa aquí.</em>',p:'Un poco de Hyrule en tu propio espacio.',c:'Zelda',src:'assets/hero/escudo-zelda-cutout-v2.webp',alt:'Escudo de Zelda fabricado por BoomArt',caption:'Escudo de Hyrule · Zelda',tone:'hyrule',product:'escudo-zelda'},
    {k:'COSPLAY EN BOOMART',h:'Entra en<br><em>personaje.</em>',p:'Tu próxima transformación empieza aquí.',c:'🎃 Halloween',src:'assets/hero/casco-del-mandaloriano.webp',alt:'Casco del Mandaloriano de BoomArt',caption:'Casco del Mandaloriano · Cosplay',tone:'cosplay',product:'casco-del-mandaloriano'},
    {k:'SOPORTES DE MANDOS',h:'Dale carácter<br><em>a tu setup.</em>',p:'Tu mando también merece su propio lugar.',c:'Soportes de Mandos',src:'assets/hero/soporte-picoro-cutout-v3.webp',alt:'Soporte de Picoro con un mando de referencia',caption:'Soporte de Picoro · Mando no incluido',tone:'gaming',product:'soporte-mando-picoro'},
    {k:'COLECCIÓN HARRY POTTER',h:'La magia<br><em>toma vuelo.</em>',p:'Fawkes, un poco de Hogwarts en tu propio espacio.',c:'Harry Potter',src:'assets/hero/fawkes.webp',alt:'Fawkes, el fénix de Dumbledore, de BoomArt',caption:'Fawkes · Harry Potter',tone:'magic',product:'fawkes-fenix-de-dumbledore'}
  ];
  const slideCount=slides.length;
  document.querySelector('.v2-hero-controls>div').innerHTML=slides.map((s,i)=>`<button type="button" data-v2-slide="${i}" aria-label="Ver ${esc(themes[s.c]?.short||s.c)}" aria-pressed="${i===0}"></button>`).join('');
  document.querySelector('#v2HeroCount').textContent=`01 / ${String(slideCount).padStart(2,'0')}`;
  function showSlide(i){heroIndex=i;const s=slides[i],root=document.querySelector('.v2-hero');root.dataset.tone=s.tone;document.querySelector('#v2HeroKicker').textContent=s.k;document.querySelector('#v2HeroTitle').innerHTML=s.h;document.querySelector('#v2HeroText').textContent=s.p;const link=document.querySelector('#v2HeroLink');link.dataset.filter=s.c;link.innerHTML=`Explorar ${esc(themes[s.c]?.short||s.c)} <span aria-hidden="true">↗</span>`;window.BoomArtImages.apply(document.querySelector('#v2HeroImage'),s.src,'main');document.querySelector('#v2HeroImage').alt=s.alt;const productButton=document.querySelector('#v2HeroProduct');productButton.dataset.open=s.product;productButton.setAttribute('aria-label',`Ver producto: ${s.caption}`);productButton.title=`Ver producto: ${s.caption}`;document.querySelector('#v2HeroCaption').textContent=s.caption;document.querySelector('#v2HeroCount').textContent=`${String(i+1).padStart(2,'0')} / ${String(slideCount).padStart(2,'0')}`;document.querySelectorAll('[data-v2-slide]').forEach((el,n)=>el.setAttribute('aria-pressed',String(n===i)));}
  function updatePause(){const b=document.querySelector('#v2HeroPause');b.textContent=heroPaused?'▶':'Ⅱ';b.setAttribute('aria-label',heroPaused?'Reanudar carrusel':'Pausar carrusel');}
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');heroPaused=reduced.matches;updatePause();
  // Mantener la pieza elegida mientras se abre o se recorre con teclado.
  for(const event of ['click','focus'])document.querySelector('#v2HeroProduct').addEventListener(event,()=>{heroPaused=true;updatePause();});
  reduced.addEventListener('change',e=>{if(e.matches){heroPaused=true;updatePause();}});
  document.querySelector('#v2HeroPause').addEventListener('click',()=>{heroPaused=!heroPaused;updatePause();});
  setInterval(()=>{if(!heroPaused&&!document.hidden&&document.body.dataset.view==='home'&&document.querySelector('.v2-hero').getBoundingClientRect().bottom>0)showSlide((heroIndex+1)%slideCount);},7500);
})();
