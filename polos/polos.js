(() => {
  const $ = (id) => document.getElementById(id);
  const SEO = window.BoomartPolosSEO;
  const image = (shot, alt, lazy = true) => {
    const img = document.createElement("img");
    Object.assign(img, {src: shot.archivo, alt, width: shot.ancho, height: shot.alto, loading: lazy ? "lazy" : "eager"});
    return img;
  };
  const button = (label, action) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.onclick = action;
    return b;
  };
  let data;
  // Polos del carrusel de portada (data/portada.json).
  let portada = null;
  let selected;
  // Foto con la que abre la ficha cuando se llega desde una miniatura (-1: la primera).
  let fotoInicial = -1;
  const price = (amount) => "S/ " + amount;
  let details = $("ficha");
  function activateDetails() {
    if (details.tagName !== 'SECTION') return;
    const dialog = document.createElement('dialog');
    for (const attr of details.attributes) dialog.setAttribute(attr.name, attr.value);
    dialog.append(...details.childNodes);
    details.replaceWith(dialog);
    details = dialog;
  }

  // Medicion propia (src/track.js). Siempre opcional: si no cargo, la tienda sigue igual.
  const medir = (name, props) => {
    try { window.BoomartTrack?.event(name, props); } catch { /* medir nunca rompe la tienda */ }
  };

  // Favoritos: el corazon de cada polo. Se recuerdan en este dispositivo, sin registro.
  const FAVORITOS_KEY = "boomart_polos_favoritos_v1";
  const favoritos = new Set();
  const corazones = new Map();
  let soloFavoritos = false;
  let pintarColeccion = () => {};

  // Navegacion: cada coleccion tiene su enlace (#/c/harry-potter); «todos» es la coleccion completa.
  const slug = (texto) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const rutaDe = tema => SEO.collectionPath(tema);
  const rutaProducto = id => SEO.productPath(id);
  let carruselIniciado = false;
  function asegurarCarrusel() { if (!carruselIniciado) { carruselIniciado = true; iniciarCarrusel(); } }
  let temaActual = () => "todos";
  let elegirColeccion = () => {};
  // La ficha abierta desde una tarjeta vuelve al mismo lugar de la grilla; desde otro sitio, al inicio de la coleccion.
  let desdeGrilla = false;
  let collectionScroll = 0;
  // Modelo de las fotos: «m» mujer, «h» hombre o «» (como vienen). El dato vive en data/fotos-genero.json.
  const MODELO_KEY = "boomart_polos_modelo_v1";
  let generos = null;
  let modelo = "";
  const generoDe = (shot) => generos ? generos.fotos[shot.archivo] || generos.modelos[shot.titulo.split(" · ")[1]] || "" : "";
  // Orden de las fotos de un polo: primero las del modelo elegido y luego el resto, como estaban.
  function ordenFotos(p) {
    const todas = p.fotos.map((_, i) => i);
    if (!modelo) return todas;
    const primero = todas.filter(i => generoDe(p.fotos[i]) === modelo);
    return primero.length ? [...primero, ...todas.filter(i => !primero.includes(i))] : todas;
  }
  const aplicarModelo = [];

  // Tarjeta pequena de un polo: «Quiza tambien te guste», «Completa tu pack» y «Vistos recientemente».
  function miniPolo(p) {
    const a = document.createElement("a");
    a.className = "parecido";
    a.href = rutaProducto(p.id);
    const precio = document.createElement("p");
    precio.textContent = price(p.precio);
    const nombre = document.createElement("h4");
    nombre.textContent = p.nombre;
    a.append(image(p.fotos[ordenFotos(p)[0]], p.nombre), precio, nombre);
    return a;
  }

  // Barra de compra fija de la ficha: se muestra cuando «Agregar al carrito» no esta a la vista.
  let revisarCompraFija = () => {};

  // Vistos recientemente: los ultimos polos abiertos en este dispositivo.
  const VISTOS_KEY = "boomart_polos_vistos_v1";
  let vistos = [];
  const polosVistos = () => vistos.map(id => data.productos.find(p => p.id === id)).filter(Boolean);
  function pintarVistosPagina() {
    const lista = polosVistos().slice(0, 4);
    $("vistosPaginaLista").replaceChildren(...lista.map(miniPolo));
    $("vistosPagina").hidden = lista.length === 0;
  }
  function anotarVisto(id) {
    vistos = [id, ...vistos.filter(otro => otro !== id)].slice(0, 8);
    try { localStorage.setItem(VISTOS_KEY, JSON.stringify(vistos)); } catch { /* sin memoria: solo dura esta visita */ }
    pintarVistosPagina();
  }

  // Pack de lanzamiento: misma regla que el carrito (cada grupo de N polos lleva el precio del pack).
  function estadoPack() {
    const promo = data.promocion;
    if (!promo) return null;
    const cantidad = window.BoomartCart.getState().totals.itemCount;
    const resto = cantidad % promo.cantidad;
    return {promo, cantidad, resto, faltan: promo.cantidad - resto, packs: Math.floor(cantidad / promo.cantidad)};
  }
  function textoPack(e) {
    const oferta = e.promo.cantidad + " polos por " + price(e.promo.precio);
    const faltan = e.faltan === 1 ? "Te falta 1" : "Te faltan " + e.faltan;
    if (e.cantidad === 0) return "Pack de lanzamiento: " + oferta + ".";
    if (e.resto === 0) return e.packs === 1 ? "Pack completo: " + oferta + "." : e.packs + " packs completos, cada uno de " + oferta + ".";
    if (e.packs === 0) return "Llevas " + (e.resto === 1 ? "1 polo" : e.resto + " polos") + " en el carrito. " + faltan + " para el pack de " + oferta + ".";
    return "Ya tienes " + (e.packs === 1 ? "1 pack" : e.packs + " packs") + ". " + faltan + " para otro pack de " + oferta + ".";
  }
  function pintarPack() {
    const e = estadoPack();
    if (!e) return;
    const pasos = () => {
      const fila = document.createElement("div");
      fila.className = "pack-pasos";
      fila.setAttribute("aria-hidden", "true");
      for (let i = 0; i < e.promo.cantidad; i++) {
        const paso = document.createElement("i");
        if (e.cantidad && (e.resto === 0 || i < e.resto)) paso.className = "hecho";
        fila.append(paso);
      }
      return fila;
    };
    $("packFicha").hidden = false;
    $("packFichaTexto").textContent = textoPack(e);
    $("packFichaPasos").replaceWith(Object.assign(pasos(), {id: "packFichaPasos"}));
    const aviso = document.createElement("span");
    aviso.textContent = e.cantidad ? textoPack(e) : "Pack de lanzamiento · " + e.promo.cantidad + " polos por " + price(e.promo.precio);
    $("packLanzamiento").hidden = false;
    $("packLanzamiento").replaceChildren(...(e.cantidad ? [aviso, pasos()] : [aviso]));
  }

  function pintarRuta(lista, partes) {
    lista.replaceChildren(...partes.map(([texto, href]) => {
      const li = document.createElement("li");
      const nodo = document.createElement(href ? "a" : "span");
      nodo.textContent = texto;
      if (href) nodo.href = href;
      else nodo.setAttribute("aria-current", "page");
      li.append(nodo);
      return li;
    }));
  }

  function iconoCorazon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "ico");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    // Corazon geometrico, de lineas rectas. Dos trazos iguales: abajo un contorno claro
    // (para fotos oscuras) y encima la silueta.
    for (const clase of ["halo", "silueta"]) {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("class", clase);
      path.setAttribute("d", "M12 20.5L3.5 11.5V7L7 3.5H10L12 6L14 3.5H17L20.5 7V11.5Z");
      svg.append(path);
    }
    return svg;
  }

  function pintarCorazon(boton, product) {
    const guardado = favoritos.has(product.id);
    boton.classList.toggle("guardado", guardado);
    const texto = boton.querySelector("span");
    boton.setAttribute("aria-pressed", String(guardado));
    if (texto) texto.textContent = guardado ? "Guardado en favoritos" : "Guardar en favoritos";
    else boton.setAttribute('aria-label', (guardado ? 'Quitar de favoritos: ' : 'Guardar en favoritos: ') + product.nombre);
  }

  function pintarContadorFavoritos() {
    const n = favoritos.size;
    $("favoritosCount").textContent = n;
    $("favoritosCount").hidden = n === 0;
    $("verFavoritos").classList.toggle("guardado", n > 0);
    $("verFavoritos").setAttribute("aria-label", n === 1 ? "Ver mis favoritos: 1 polo" : "Ver mis favoritos: " + n + " polos");
  }

  function alternarFavorito(product, origen, boton) {
    const guardar = !favoritos.has(product.id);
    if (guardar) favoritos.add(product.id);
    else favoritos.delete(product.id);
    try { localStorage.setItem(FAVORITOS_KEY, JSON.stringify([...favoritos])); } catch { /* sin memoria: vale mientras dure la visita */ }
    medir(guardar ? "me_gusta" : "quitar_me_gusta", {p: product.id, o: origen});
    const tarjeta = corazones.get(product.id);
    if (tarjeta) pintarCorazon(tarjeta, product);
    if (selected === product) pintarCorazon($("favoritoFicha"), product);
    if (guardar) {
      boton.classList.remove("latido");
      void boton.offsetWidth;
      boton.classList.add("latido");
    }
    pintarContadorFavoritos();
    pintarColeccion();
    // Al quitar un favorito desde su lista, la tarjeta desaparece: el foco pasa al boton de la lista.
    if (!guardar && soloFavoritos && origen === "tarjeta") {
      ($("alternarFavoritos").hidden ? $("limpiarPolos") : $("alternarFavoritos")).focus();
    }
  }

  // Fotos de la ficha: cuadricula de fotos grandes (en celular, una fila que se desliza).
  // En computadora se ven las cuatro primeras y un boton muestra el resto.
  const FOTOS_A_LA_VISTA = 4;
  function pintarFotos(product, orden, inicial) {
    const caja = $("fotosFicha");
    caja.classList.toggle("todas", inicial >= FOTOS_A_LA_VISTA);
    caja.replaceChildren(...orden.map((indice, i) => {
      const shot = product.fotos[indice];
      const alt = product.nombre + " · " + shot.titulo;
      const b = button("", () => {
        $("fotoAmpliada").replaceChildren(image(shot, alt, false));
        $("visorPolo").showModal();
      });
      b.className = "ficha-foto";
      b.setAttribute("aria-label", "Ampliar foto: " + shot.titulo);
      b.append(image(shot, alt, i >= 2));
      return b;
    }));
    const resto = product.fotos.length - FOTOS_A_LA_VISTA;
    $("masFotos").hidden = resto <= 0 || caja.classList.contains("todas");
    $("masFotos").textContent = resto === 1 ? "Ver 1 foto más" : "Ver " + resto + " fotos más";
  }

  // Corte y talla se eligen con botones y cada polo se elige de nuevo. Solo viene marcado el corte
  // cuando el comprador ya eligio ver la coleccion en mujer o en hombre.
  let corte = "";
  let talla = "";
  const medidasElegidas = () => data.medidas[corte]?.[talla];

  function pintarOpciones() {
    for (const input of $("corteFicha").querySelectorAll("input")) input.checked = input.value === corte;
    const sizes = data.medidas[corte];
    $("tallasFicha").replaceChildren(...selected.tallas.map(size => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      Object.assign(input, {type: "radio", name: "tallaFicha", value: size, checked: size === talla, disabled: Boolean(corte) && !sizes?.[size]});
      const text = document.createElement("span");
      text.textContent = size;
      label.append(input, text);
      return label;
    }));
    const size = medidasElegidas();
    $("medidasFicha").classList.remove("falta");
    $("medidasFicha").textContent = size
      ? `Pecho ${size.pecho} cm · Largo ${size.largo} cm · Hombros ${size.hombros} cm · Manga ${size.manga} cm`
      : "";
    // La barra de compra fija repite el polo y lo elegido.
    $("compraFijaNombre").textContent = selected.nombre;
    $("compraFijaDetalle").textContent = price(selected.precio) + " · "
      + (size ? (corte === "hombre" ? "Hombre" : "Mujer") + " · Talla " + talla : corte ? "Elige tu talla" : "Elige corte y talla");
  }

  function renderSizeGuide(container) {
    if (data.medidas_provisionales) {
      const note = document.createElement('p');
      note.className = 'nota';
      note.textContent = 'Medidas referenciales de la prenda. Confirma tu talla con BoomArt antes de pedir.';
      container.append(note);
    }
    for (const [cut, sizes] of Object.entries(data.medidas)) {
      const table = document.createElement("table");
      table.createCaption().textContent = cut === "hombre" ? "Hombre" : "Mujer";
      const head = table.createTHead().insertRow();
      for (const label of ["Talla", "Pecho", "Largo", "Hombros", "Manga"]) {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = label;
        head.append(cell);
      }
      const body = table.createTBody();
      for (const [size, dimensions] of Object.entries(sizes)) {
        const row = body.insertRow();
        for (const value of [size, dimensions.pecho, dimensions.largo, dimensions.hombros, dimensions.manga]) {
          row.insertCell().textContent = value;
        }
      }
      container.append(table);
    }
  }

  function openProduct(product) {
    selected = product;
    $("temaFicha").textContent = product.tema;
    $("nombreFicha").textContent = product.nombre;
    $("precioFicha").textContent = price(product.precio) + " por unidad";
    $("descripcionFicha").textContent = product.texto;
    $("materialFicha").textContent = product.material;
    $("colorFicha").textContent = "Polo " + product.color + " · Mangas lisas";
    pintarRuta($("rutaFicha"), [["Polos", rutaDe("todos")], [product.tema, rutaDe(product.tema)], [product.nombre, null]]);
    // Quien ve la coleccion en mujer o en hombre llega con ese corte marcado; puede cambiarlo.
    corte = modelo === "h" && data.medidas.hombre ? "hombre" : modelo === "m" && data.medidas.mujer ? "mujer" : "";
    talla = "";
    pintarOpciones();
    // Las fotos siguen el modelo elegido. Si se llego desde una miniatura de la galeria, la ficha abre en esa foto.
    const orden = ordenFotos(product);
    const inicial = fotoInicial >= 0 ? Math.max(0, orden.indexOf(fotoInicial)) : 0;
    fotoInicial = -1;
    pintarFotos(product, orden, inicial);
    // Con el pack a medias se sugieren polos que aun no estan en el carrito; si no, otros de la misma coleccion.
    const pack = estadoPack();
    const otros = data.productos.filter(p => p !== product);
    const delTema = (lista) => [...lista.filter(p => p.tema === product.tema), ...lista.filter(p => p.tema !== product.tema)];
    let parecidos = otros.filter(p => p.tema === product.tema).slice(0, 4);
    const completar = Boolean(pack && pack.resto > 0);
    if (completar) {
      const enCarrito = new Set(window.BoomartCart.getState().lines.map(line => line.productId));
      parecidos = delTema(otros.filter(p => !enCarrito.has(p.id))).slice(0, 4);
      $("parecidosNota").textContent = textoPack(pack);
    }
    $("parecidosTitulo").textContent = completar ? "Completa tu pack" : "Quizá también te guste";
    $("parecidosNota").hidden = !completar;
    $("parecidosFicha").replaceChildren(...parecidos.map(miniPolo));
    $("parecidosSeccion").hidden = parecidos.length === 0;
    pintarPack();
    // Vistos recientemente: los anteriores a este polo que no esten ya sugeridos arriba.
    const antes = polosVistos().filter(p => p !== product && !parecidos.includes(p)).slice(0, 4);
    $("vistosFicha").replaceChildren(...antes.map(miniPolo));
    $("vistosFichaSeccion").hidden = antes.length === 0;
    anotarVisto(product.id);
    pintarCorazon($("favoritoFicha"), product);
    if (!details.open) details.showModal();
    details.scrollTop = 0;
    // En celular las fotos son una fila que se desliza: cada polo empieza en su primera foto.
    $("fotosFicha").scrollLeft = 0;
    if (inicial > 0) $("fotosFicha").children[inicial].scrollIntoView({block: "nearest", inline: "center"});
    revisarCompraFija();
    medir("ver_producto", {p: product.id, o: "polos"});
  }
  function heading(id, tag) {
    const old = $(id);
    if (!old || old.tagName.toLowerCase() === tag) return;
    const node = document.createElement(tag);
    node.id = old.id; node.innerHTML = old.innerHTML;
    old.replaceWith(node);
  }
  function updatePageMetadata(page) {
    const meta = SEO.metadata(page, data.productos);
    document.title = meta.title;
    for (const [selector, value] of [
      ['meta[name="description"]', meta.description],
      ['meta[property="og:title"]', meta.title],
      ['meta[property="og:description"]', meta.description],
      ['meta[property="og:url"]', meta.url],
      ['meta[property="og:image"]', meta.image],
      ['meta[property="og:image:alt"]', page.product?.nombre || 'Colección de polos BoomArt'],
      ['meta[property="og:type"]', page.product ? 'product' : 'website']
    ]) document.querySelector(selector)?.setAttribute('content', value);
    document.querySelector('link[rel="canonical"]').href = meta.url;
    $('polosSchema').textContent = JSON.stringify(SEO.schemas(page, data.productos));
    document.body.dataset.seoPage = page.type;
    $('app').hidden = page.type === 'product';
    document.querySelector('footer.pie').hidden = page.type === 'product';
    heading('tituloPortada', page.type === 'home' ? 'h1' : 'h2');
    heading('tituloColeccion', page.type === 'collection' ? 'h1' : 'h2');
    heading('nombreFicha', page.type === 'product' ? 'h1' : 'h2');
    $('tituloColeccion').textContent = page.type === 'collection' ? 'Polos de ' + page.theme : 'Elige tu diseño';
    $('introColeccion').textContent = page.type === 'collection'
      ? `Diseños de ${page.theme} para llevar tu universo favorito contigo. Explora las fotos, elige corte y talla y prepara tu pedido.`
      : 'Diseños para compartir lo que te apasiona. Explora cada polo, revisa sus fotos y elige tu corte y talla.';
    pintarRuta($('rutaPagina'), [['BoomArt','/'], ['Polos',page.type === 'home' ? null : '/polos/'], ...(page.type === 'collection' ? [[page.theme,null]] : [])]);
  }
  function navigate(url, {replace = false, keepPosition = false} = {}) {
    history[replace ? 'replaceState' : 'pushState'](null, '', url);
    route(keepPosition);
  }
  function route(keepPosition = false) {
    const page = SEO.route(location.href, data.productos);
    if (page.product && !details.open && !$('app').hidden) collectionScroll = window.scrollY;
    // Compatibilidad con todos los enlaces publicados con #/p/ y #/c/.
    if (/^#\/[pc]\//.test(location.hash)) history.replaceState(null, '', page.path);
    updatePageMetadata(page);
    if (page.product) return openProduct(page.product);
    const regreso = details.open && desdeGrilla && page.theme === temaActual();
    if (details.open) details.close();
    if (keepPosition || regreso) {
      window.scrollTo({top:collectionScroll, behavior:'instant'});
      return;
    }
    elegirColeccion(page.theme);
    if (page.type === 'home') asegurarCarrusel();
    if (page.type === 'collection') $('coleccion').scrollIntoView();
    else if (!location.hash) window.scrollTo(0, 0);
  }
  function entradasAlDesplazar() {
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    }, {threshold: 0.06});
    for (const node of document.querySelectorAll(".producto-celda, #proceso .proceso article, #prenda .prenda-grid article")) {
      if (node.getBoundingClientRect().top < innerHeight) continue;
      node.classList.add("preparar-entrada");
      observer.observe(node);
    }
  }


  // Portada: una sola foto a la vez, que se funde con la siguiente. La barra activa marca el tiempo
  // (lo fija el CSS en --vitrina-tiempo) y, al llenarse, pasa al polo siguiente.
  function iniciarCarrusel() {
    const rail = $("vitrinaFotos");
    const region = $("vitrina");
    // Los polos y sus fotos vienen de data/portada.json. Si falta, van los primeros de la coleccion.
    let elegidos = (portada || []).map(entrada => {
      const product = data.productos.find(p => p.id === entrada.id);
      return product && {product, indice: Math.max(0, product.fotos.findIndex(shot => shot.archivo === entrada.foto))};
    }).filter(Boolean);
    if (elegidos.length < 2) elegidos = data.productos.slice(0, 6).map(product => ({product, indice: 0}));
    if (!elegidos.length) return;
    let active = 0;
    const slides = elegidos.map(({product, indice}, i) => {
      const link = document.createElement("a");
      link.className = "vitrina-foto";
      link.href = rutaProducto(product.id);
      const shot = product.fotos[indice];
      const img = image(shot, product.nombre, false);
      // Solo la primera foto se pide de inmediato; las demas, cuando la pagina termino de cargar.
      if (i > 0) {
        img.removeAttribute("src");
        img.dataset.src = shot.archivo;
      }
      link.append(img);
      // La ficha abre en la misma foto que se vio en la portada.
      link.addEventListener("click", () => { fotoInicial = indice; });
      return link;
    });
    const cargarFoto = (index) => {
      const img = slides[(index + slides.length) % slides.length].querySelector('img[data-src]');
      if (img) { img.src = img.dataset.src; delete img.dataset.src; }
    };
    const barras = elegidos.map(({product}, i) => {
      const b = button("", () => show(i));
      b.setAttribute("aria-label", "Ver " + product.nombre);
      b.append(document.createElement("i"));
      return b;
    });
    function show(index) {
      const n = slides.length;
      active = (index + n) % n;
      cargarFoto(active);
      cargarFoto(active + 1);
      slides.forEach((slide, i) => {
        slide.classList.toggle("actual", i === active);
        slide.tabIndex = i === active ? 0 : -1;
        slide.setAttribute("aria-hidden", String(i !== active));
      });
      barras.forEach((b, i) => {
        b.classList.toggle("vista", i < active);
        b.classList.remove("activa");
        b.setAttribute("aria-current", String(i === active));
      });
      // Leer el ancho obliga a reiniciar la animacion de la barra aunque sea el mismo polo.
      void barras[active].offsetWidth;
      barras[active].classList.add("activa");
      const {product} = elegidos[active];
      $("temaDestacado").textContent = product.tema;
      $("poloDestacado").textContent = product.nombre;
      $("precioDestacado").textContent = price(product.precio);
      $("verDestacado").href = rutaProducto(product.id);
    }
    rail.replaceChildren(...slides);
    $("barrasCarrusel").replaceChildren(...barras);
    $("barrasCarrusel").hidden = slides.length < 2;
    $("verDestacado").addEventListener("click", () => { fotoInicial = elegidos[active].indice; });
    $("carruselAnterior").onclick = () => show(active - 1);
    $("carruselSiguiente").onclick = () => show(active + 1);
    $("carruselAnterior").disabled = $("carruselSiguiente").disabled = slides.length < 2;
    region.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const refocus = rail.contains(document.activeElement);
      show(active + (event.key === "ArrowLeft" ? -1 : 1));
      if (refocus) slides[active].focus();
    });
    let start;
    rail.addEventListener("touchstart", (event) => { start = event.touches[0]; }, {passive:true});
    rail.addEventListener("touchend", (event) => {
      if (!start) return;
      const end = event.changedTouches[0];
      const x = end.clientX - start.clientX;
      const y = end.clientY - start.clientY;
      start = null;
      if (Math.abs(x) > 45 && Math.abs(x) > Math.abs(y)) show(active + (x > 0 ? -1 : 1));
    }, {passive:true});
    show(0);
    if (slides.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Al llenarse la barra pasa al siguiente. Si hay una ventana abierta, la portada ya no se ve
    // o la foto siguiente aun no cargo, la barra vuelve a empezar en el mismo polo.
    $("barrasCarrusel").addEventListener("animationend", () => {
      const siguiente = slides[(active + 1) % slides.length].querySelector("img");
      const libre = !document.querySelector("dialog[open]")
        && $("cartToggle").getAttribute("aria-expanded") !== "true"
        && region.getBoundingClientRect().bottom > 0
        && siguiente.complete && siguiente.naturalWidth > 0;
      show(libre ? active + 1 : active);
    });
    // Pausa a pedido. Con mouse encima o con el teclado dentro, el CSS ya detiene la barra.
    const toggle = $("pausarCarrusel");
    toggle.hidden = false;
    toggle.onclick = () => {
      const pausa = region.classList.toggle("en-pausa");
      toggle.setAttribute("aria-label", pausa ? "Reanudar el carrusel" : "Pausar el carrusel");
      toggle.querySelector("path").setAttribute("d", pausa ? "M8 5L18.5 12L8 19Z" : "M8.5 5V19M15.5 5V19");
    };
  }

  function iniciarBusqueda() {
    const search = $("buscarPolo");
    const sort = $("ordenPolo");
    const conMouse = matchMedia("(hover: hover) and (pointer: fine)");

    // Pestanas por coleccion: «Ver todo» y una por cada tema, con su cantidad.
    let tema = "todos";
    // Color del polo: «» es todos. Los botones salen de los colores que hay en la coleccion.
    let color = "";
    const marcarColor = () => {
      for (const input of $("coloresPolo").querySelectorAll("input")) input.checked = input.value === color;
    };
    $("coloresPolo").replaceChildren(...[{id: "", nombre: "Todos"}, ...data.colores.filter(c => data.productos.some(p => p.color === c.id))].map(c => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      Object.assign(input, {type: "radio", name: "colorPolo", value: c.id});
      const text = document.createElement("span");
      text.textContent = c.nombre;
      label.append(input, text);
      return label;
    }));
    marcarColor();
    const pestanas = [["todos", "Ver todo", data.productos.length]];
    for (const name of new Set(data.productos.map(p => p.tema))) {
      pestanas.push([name, name, data.productos.filter(p => p.tema === name).length]);
    }
    $("coleccionesPolo").replaceChildren(...pestanas.map(([valor, texto, cantidad]) => {
      const b = button(texto, () => {
        tema = valor;
        pintar();
        // La direccion acompana a la pestana, para poder compartir el enlace de una coleccion.
        history.replaceState(null, "", rutaDe(tema));
        updatePageMetadata(SEO.route(location.href, data.productos));
      });
      b.dataset.tema = valor;
      const n = document.createElement("span");
      n.textContent = cantidad;
      b.append(n);
      return b;
    }));
    // Las mismas colecciones, como enlaces: en la cabecera y en el menu lateral (con su cantidad).
    const enlaces = (conCantidad) => pestanas.map(([valor, texto, cantidad]) => {
      const a = document.createElement("a");
      a.href = rutaDe(valor);
      a.dataset.tema = valor;
      a.textContent = valor === "todos" ? "Todos los polos" : texto;
      if (conCantidad) {
        const n = document.createElement("span");
        n.textContent = cantidad;
        a.append(n);
      }
      return a;
    });
    $("navColecciones").replaceChildren(...enlaces(false));
    $("menuColecciones").replaceChildren(...enlaces(true));
    temaActual = () => tema;
    // Llegar por un enlace de coleccion muestra la coleccion entera: sin busqueda ni filtro de favoritos.
    elegirColeccion = (valor) => {
      tema = valor;
      search.value = "";
      color = "";
      marcarColor();
      soloFavoritos = false;
      pintar();
    };

    const cards = new Map();
    const cerrarTarjetas = [];
    for (const p of data.productos) {
      const a = document.createElement("a");
      a.className = "producto-card";
      a.href = rutaProducto(p.id);
      const media = document.createElement("div");
      media.className = "producto-fotos";
      // «orden» son los indices de las fotos del polo: primero las del modelo elegido.
      let orden = ordenFotos(p);
      const base = image(p.fotos[orden[0]], p.nombre);
      media.append(base);
      const tira = document.createElement("div");
      tira.className = "producto-tira";
      tira.setAttribute("aria-hidden", "true");
      const precio = document.createElement("p");
      precio.className = "producto-precio";
      precio.textContent = price(p.precio);
      const title = document.createElement("h3");
      title.textContent = p.nombre;
      const meta = document.createElement("p");
      meta.className = "producto-detalle";
      meta.textContent = p.tema;
      const prenda = document.createElement("p");
      prenda.className = "producto-detalle";
      prenda.textContent = "Polo " + p.color;
      a.append(media, tira, precio, title, meta, prenda);

      // Con mouse: la tarjeta se despliega con miniaturas y cada una cambia la foto grande.
      // Las fotos extra se cargan recien al pasar el mouse por la tarjeta.
      const capas = new Map();
      let actual = 0;
      const ver = (i) => {
        actual = i;
        for (const mini of tira.children) mini.classList.toggle("activa", mini.dataset.foto === String(i));
        for (const [k, capa] of capas) capa.classList.toggle("lista", k === i && capa.dataset.cargada === "1");
        if (i === 0 || capas.has(i)) return;
        const capa = image(p.fotos[orden[i]], "", false);
        capa.className = "producto-foto-vista";
        capa.setAttribute("aria-hidden", "true");
        capas.set(i, capa);
        media.append(capa);
        capa.decode().then(() => {
          capa.dataset.cargada = "1";
          capa.classList.toggle("lista", actual === i);
        }).catch(() => {
          capa.remove();
          capas.delete(i);
        });
      };
      const armarTira = () => {
        // Miniatura de 52 px + 6 px de separacion; si no caben todas, la ultima casilla dice cuantas faltan.
        const caben = Math.max(2, Math.floor((media.clientWidth + 6) / 58));
        if (tira.dataset.caben === String(caben)) return;
        tira.dataset.caben = caben;
        const visibles = orden.length > caben ? caben - 1 : orden.length;
        const minis = orden.slice(0, visibles).map((indice, i) => {
          const shot = p.fotos[indice];
          const mini = document.createElement("span");
          mini.className = "producto-mini";
          mini.dataset.foto = i;
          mini.append(image(shot, "", false));
          mini.addEventListener("pointerenter", () => ver(i));
          mini.addEventListener("click", () => { fotoInicial = indice; });
          return mini;
        });
        if (orden.length > visibles) {
          const mas = document.createElement("span");
          mas.className = "producto-mini-mas";
          mas.textContent = "+" + (orden.length - visibles);
          minis.push(mas);
        }
        tira.replaceChildren(...minis);
      };
      aplicarModelo.push(() => {
        orden = ordenFotos(p);
        const shot = p.fotos[orden[0]];
        Object.assign(base, {src: shot.archivo, width: shot.ancho, height: shot.alto});
        for (const capa of capas.values()) capa.remove();
        capas.clear();
        delete tira.dataset.caben;
        tira.replaceChildren();
        actual = 0;
      });
      // El corazon va fuera del enlace: un boton dentro de un enlace no es valido.
      const heart = document.createElement("button");
      heart.type = "button";
      heart.className = "favorito";
      heart.setAttribute("aria-label", "Guardar en favoritos: " + p.nombre);
      heart.append(iconoCorazon());
      heart.onclick = () => alternarFavorito(p, "tarjeta", heart);
      pintarCorazon(heart, p);
      corazones.set(p.id, heart);
      const cell = document.createElement("div");
      cell.className = "producto-celda";
      cell.append(a, heart);
      cards.set(p.id, cell);
      const cerrar = () => {
        cell.classList.remove("abierta");
        ver(0);
      };
      cerrarTarjetas.push(cerrar);
      // Al abrir la ficha desde la tarjeta, el mouse queda sobre el dialogo: se cierra aqui.
      a.addEventListener("click", () => {
        cerrar();
        desdeGrilla = true;
      });
      cell.addEventListener("pointerenter", (event) => {
        if (event.pointerType !== "mouse" || !conMouse.matches || p.fotos.length < 2) return;
        armarTira();
        cell.classList.add("abierta");
        ver(1);
      });
      cell.addEventListener("pointerleave", cerrar);
    }
    function pintar() {
      let list = CATALOGO_UI.filtrar(data.productos, {busqueda: search.value, tema, orden: sort.value});
      if (color) list = list.filter(p => p.color === color);
      if (soloFavoritos) list = list.filter(p => favoritos.has(p.id));
      // Una tarjeta que sale de la grilla no recibe «pointerleave»: se cierra antes de moverla.
      for (const cerrar of cerrarTarjetas) cerrar();
      for (const b of $("coleccionesPolo").children) b.setAttribute("aria-pressed", String(b.dataset.tema === tema));
      for (const a of [...$("navColecciones").children, ...$("menuColecciones").children]) {
        if (a.dataset.tema === tema && tema !== "todos") a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      }
      $("grilla").replaceChildren(...list.map(p => cards.get(p.id)));
      const total = list.length === 1 ? "1 polo" : list.length + " polos";
      $("resultadoPolos").textContent = !soloFavoritos ? total : list.length ? "Tus favoritos: " + total : "Tus favoritos";
      $("sinPolos").hidden = list.length !== 0;
      $("sinPolosTexto").textContent = !soloFavoritos ? "No encontramos polos con esos filtros."
        : favoritos.size ? "Ninguno de tus favoritos coincide con esos filtros."
        : "Aún no tienes favoritos. Toca el corazón de un polo para guardarlo aquí.";
      $("alternarFavoritosTexto").textContent = soloFavoritos ? "Ver todos los polos"
        : favoritos.size ? "Ver mis favoritos (" + favoritos.size + ")" : "Ver mis favoritos";
      $("alternarFavoritos").classList.toggle("activo", soloFavoritos);
      // Sin resultados en favoritos, «Ver todos los polos» ya aparece en el aviso de abajo.
      $("alternarFavoritos").hidden = soloFavoritos && list.length === 0;
    }
    pintarColeccion = pintar;
    search.addEventListener("input", pintar);
    $("colorPolo").onchange = (event) => {
      color = event.target.value;
      pintar();
    };
    // Ver los polos en mujer o en hombre: cambia la foto de cada tarjeta y se recuerda en este dispositivo.
    if (generos) {
      $("modeloPolo").hidden = false;
      for (const input of $("modeloPolo").querySelectorAll("input")) input.checked = input.value === modelo;
      $("modeloPolo").onchange = (event) => {
        modelo = event.target.value;
        try { localStorage.setItem(MODELO_KEY, modelo); } catch { /* sin memoria: vale para esta visita */ }
        for (const cambiar of aplicarModelo) cambiar();
        pintarVistosPagina();
      };
    }
    sort.addEventListener("change", pintar);
    $("alternarFavoritos").onclick = () => {
      soloFavoritos = !soloFavoritos;
      pintar();
    };
    $("verFavoritos").onclick = () => {
      soloFavoritos = true;
      pintar();
      $("coleccion").scrollIntoView();
    };
    $("limpiarPolos").onclick = () => {
      search.value = "";
      tema = "todos";
      sort.value = "";
      color = "";
      marcarColor();
      soloFavoritos = false;
      pintar();
      history.replaceState(null, "", rutaDe(tema));
      updatePageMetadata(SEO.route(location.href, data.productos));
      search.focus();
    };
    pintar();
  }

  function cartPhoto(product) {
    const detail = product.tipo === "A"
      ? /detalle.*(pecho|lechuza y el castillo)/i
      : /detalle.*(espalda|estampado principal)/i;
    return product.fotos.find(shot => detail.test(shot.titulo)) || product.fotos[0];
  }

  function init(next) {
    data = next;
    activateDetails();
    window.BOOMART_PRODUCTS = data.productos.map(p => ({
      id: p.id, name: p.nombre, regularPrice: p.precio, category: p.tema,
      image: cartPhoto(p).archivo, tallas: p.tallas,
      cortes: Object.fromEntries(Object.entries(data.medidas).map(([cut, sizes]) =>
        [cut, p.tallas.filter(size => sizes[size])]))
    }));
    window.BOOMART_POLOS_PROMOTION = data.promocion;
    try {
      const legacyKey = "boomart.polos.seleccion";
      const saved = JSON.parse(localStorage.getItem(legacyKey) || "[]");
      if (Array.isArray(saved)) {
        if (!localStorage.getItem("boomart_polos_cart_v1")) {
          for (const entry of saved) {
            if (entry) window.BoomartCart.add(entry.id, entry.talla, 1);
          }
        }
        localStorage.removeItem(legacyKey);
      }
    } catch {}
    window.BoomartCart.refresh();
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITOS_KEY) || "[]");
      if (Array.isArray(saved)) {
        for (const id of saved) {
          if (data.productos.some(p => p.id === id)) favoritos.add(id);
        }
      }
    } catch { /* sin memoria: se empieza sin favoritos */ }
    try {
      const guardado = localStorage.getItem(MODELO_KEY);
      if (generos && (guardado === "h" || guardado === "m")) modelo = guardado;
      const saved = JSON.parse(localStorage.getItem(VISTOS_KEY) || "[]");
      if (Array.isArray(saved)) vistos = saved.filter(id => typeof id === "string").slice(0, 8);
    } catch { /* sin memoria: se empieza de cero */ }
    $("favoritoFicha").onclick = () => alternarFavorito(selected, "ficha", $("favoritoFicha"));
    pintarContadorFavoritos();
    renderSizeGuide($("guiasCorte"));
    renderSizeGuide($("guiasPanel"));
    if (details.hasAttribute("data-prerendered")) {
      details.close();
      details.removeAttribute("data-prerendered");
      details.querySelector('[data-static-back]')?.remove();
      $('consultaEstatica')?.remove();
    }
    if (SEO.route(location.href, data.productos).type === "home") asegurarCarrusel();
    iniciarBusqueda();
    entradasAlDesplazar();
    // El aviso del pack sigue al carrito: cuantos polos van y cuantos faltan.
    pintarPack();
    window.BoomartCart.subscribe(pintarPack);
    pintarVistosPagina();
    // Un polo abierto desde «Vistos recientemente» vuelve al mismo lugar de la pagina.
    $("vistosPagina").addEventListener("click", (event) => {
      if (event.target.closest("a")) desdeGrilla = true;
    });
    // Compra fija: aparece cuando «Agregar al carrito» no esta a la vista y hace lo mismo que ese boton.
    $("compraFijaBoton").onclick = () => {
      const falta = !medidasElegidas();
      $("agregarPolo").click();
      if (falta) {
        (corte ? $("tallasFicha") : $("corteFicha")).scrollIntoView({
          block: "center",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
        });
      }
    };
    revisarCompraFija = () => {
      // Se descuenta abajo la franja que tapa la propia barra.
      const boton = $("agregarPolo").getBoundingClientRect();
      const aLaVista = boton.bottom > 0 && boton.top < details.clientHeight - 72;
      $("compraFija").classList.toggle("visible", !aLaVista);
      $("compraFija").inert = aLaVista;
    };
    details.addEventListener("scroll", revisarCompraFija, {passive: true});
    window.addEventListener("resize", revisarCompraFija);
    $("corteFicha").onchange = (event) => {
      corte = event.target.value;
      if (talla && !medidasElegidas()) talla = "";
      pintarOpciones();
      $("corteFicha").querySelector("input:checked")?.focus();
    };
    $("tallasFicha").onchange = (event) => {
      talla = event.target.value;
      pintarOpciones();
      $("tallasFicha").querySelector("input:checked")?.focus();
    };
    $("masFotos").onclick = () => {
      $("fotosFicha").classList.add("todas");
      $("masFotos").hidden = true;
      $("fotosFicha").children[FOTOS_A_LA_VISTA]?.focus();
    };
    // Guia de tallas: panel lateral encima de la ficha. Un clic fuera del panel lo cierra.
    $("abrirGuia").onclick = () => $("guiaTallas").showModal();
    $("guiaTallas").addEventListener("click", (event) => {
      if (event.target === $("guiaTallas")) $("guiaTallas").close();
    });
    $("agregarPolo").onclick = () => {
      if (!medidasElegidas()) {
        // Sin corte o talla, el boton explica que falta y lleva el foco a esa opcion.
        $("medidasFicha").textContent = corte ? "Elige tu talla para agregarlo al carrito." : "Elige tu corte y tu talla para agregarlo al carrito.";
        $("medidasFicha").classList.add("falta");
        (corte ? $("tallasFicha") : $("corteFicha")).querySelector("input:not(:disabled)")?.focus();
        return;
      }
      const variante = `${corte}:${talla}`;
      window.BoomartCart.add(selected.id, variante, 1);
      medir("agregar_carrito", {p: selected.id, c: 1, v: selected.precio, o: "ficha", d: {variante}});
      details.close();
      $("cartToggle").click();
    };
    details.addEventListener("close", () => {
      if (details.open || SEO.route(location.href, data.productos).type !== 'product') return;
      const quedarse = desdeGrilla;
      const theme = quedarse ? temaActual() : selected.tema;
      desdeGrilla = false;
      navigate(rutaDe(theme), {replace:true, keepPosition:quedarse});
    });
    // Menu lateral (pantallas angostas): un clic fuera lo cierra y cada enlace lo cierra al navegar.
    $("abrirMenu").onclick = () => $("menuPolos").showModal();
    $("menuPolos").addEventListener("click", (event) => {
      if (event.target === $("menuPolos") || event.target.closest("a")) $("menuPolos").close();
    });
    // Las URL son páginas HTML reales. En esta pestaña se mejora la navegación sin recargar.
    document.addEventListener('click', event => {
      const a = event.target.closest?.('a[href]');
      if (!a || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || a.target || a.hasAttribute('download')) return;
      const u = new URL(a.href);
      if (u.origin !== location.origin || u.search || u.hash || !/^\/polos\/(?:$|(?:diseno|coleccion)\/[a-z0-9-]+\/$)/.test(u.pathname)) return;
      event.preventDefault();
      if (u.pathname === location.pathname) route();
      else navigate(u.pathname);
    });
    window.addEventListener('popstate', () => route());
    window.addEventListener('hashchange', () => { if (/^#\/[pc]\//.test(location.hash)) route(); });
    route();
  }
  Promise.all([
    fetch("data/polos.json?v=" + encodeURIComponent(document.body.dataset.catalogRevision || 'seo-20261117')).then(r => {
      if (!r.ok) throw new Error("Error de catálogo");
      return r.json();
    }),
    // Genero del modelo de cada foto. Si falta, la tienda funciona igual, sin «Ver los polos en».
    fetch("data/fotos-genero.json?v=1").then(r => r.ok ? r.json() : null).catch(() => null),
    // Polos y fotos del carrusel de portada. Si falta, van los primeros de la coleccion.
    fetch("data/portada.json?v=1").then(r => r.ok ? r.json() : null).catch(() => null)
  ]).then(([catalogo, fotos, vitrina]) => {
    generos = fotos && fotos.fotos && fotos.modelos ? fotos : null;
    portada = vitrina && Array.isArray(vitrina.polos) ? vitrina.polos : null;
    init(catalogo);
  }).catch(() => {
    // El HTML inicial sigue siendo útil si falla la conexión del catálogo interactivo.
    if (!$("grilla").children.length) $("grilla").textContent = "No pudimos cargar la colección. Intenta recargar la página.";
  });
})();
