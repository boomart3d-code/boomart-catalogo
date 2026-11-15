(() => {
  const $ = (id) => document.getElementById(id);
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
  let selected;
  let fotoInicial = 0;
  const price = (amount) => "S/ " + amount;
  const details = $("ficha");

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

  function iconoCorazon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    // Dos trazos iguales: abajo un contorno claro (para fotos oscuras) y encima la silueta.
    for (const clase of ["halo", "silueta"]) {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("class", clase);
      path.setAttribute("d", "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z");
      svg.append(path);
    }
    return svg;
  }

  function pintarCorazon(boton, product) {
    const guardado = favoritos.has(product.id);
    boton.classList.toggle("guardado", guardado);
    const texto = boton.querySelector("span");
    if (texto) texto.textContent = guardado ? "Guardado en favoritos" : "Guardar en favoritos";
    else boton.setAttribute("aria-pressed", String(guardado));
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
  function pintarFotos(product, inicial) {
    const caja = $("fotosFicha");
    caja.classList.toggle("todas", inicial >= FOTOS_A_LA_VISTA);
    caja.replaceChildren(...product.fotos.map((shot, i) => {
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

  // Corte y talla se eligen con botones. Nada viene marcado: cada polo se elige de nuevo.
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
  }

  function renderSizeGuide(container) {
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
    $("colorFicha").textContent = "Polo " + product.color;
    corte = "";
    talla = "";
    pintarOpciones();
    // Si se llego desde una miniatura de la galeria, la ficha muestra esa foto.
    const inicial = fotoInicial < product.fotos.length ? fotoInicial : 0;
    fotoInicial = 0;
    pintarFotos(product, inicial);
    // Otros polos de la misma coleccion.
    const parecidos = data.productos.filter(p => p.tema === product.tema && p !== product).slice(0, 4);
    $("parecidosFicha").replaceChildren(...parecidos.map(p => {
      const a = document.createElement("a");
      a.className = "parecido";
      a.href = "#/p/" + p.id;
      const precio = document.createElement("p");
      precio.textContent = price(p.precio);
      const nombre = document.createElement("h4");
      nombre.textContent = p.nombre;
      a.append(image(p.fotos[0], p.nombre), precio, nombre);
      return a;
    }));
    $("parecidosSeccion").hidden = parecidos.length === 0;
    pintarCorazon($("favoritoFicha"), product);
    if (!details.open) details.showModal();
    details.scrollTop = 0;
    if (inicial > 0) $("fotosFicha").children[inicial].scrollIntoView({block: "nearest", inline: "center"});
    medir("ver_producto", {p: product.id, o: "polos"});
  }
  function route() {
    const m = location.hash.match(/^#\/p\/([a-z0-9-]+)(?:\/probador)?$/);
    const product = m && data.productos.find(p => p.id === m[1]);
    if (product) openProduct(product);
    else if (details.open) details.close();
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


  function iniciarCarrusel() {
    const rail = $("heroFotos");
    const products = data.productos;
    if (!products.length) return;
    let active = 0;
    const slides = products.map((product, index) => {
      const link = document.createElement("a");
      link.className = "hero-polo";
      link.href = "#/p/" + product.id;
      link.append(image(product.fotos[0], product.nombre, index > 2 && index !== products.length - 1));
      link.addEventListener("click", (event) => {
        if (index === active || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        show(index);
      });
      return link;
    });
    function show(index) {
      const n = slides.length;
      active = (index + n) % n;
      slides.forEach((slide, i) => {
        const delta = (i - active + n) % n;
        const position = delta === 0 ? "actual" : delta === 1 ? "siguiente" : delta === n - 1 ? "anterior" : "fuera";
        slide.dataset.posicion = position;
        slide.tabIndex = position === "actual" ? 0 : -1;
        slide.setAttribute("aria-hidden", String(position !== "actual"));
      });
      const product = products[active];
      $("poloDestacado").textContent = product.nombre + " · " + price(product.precio);
      $("verDestacado").href = "#/p/" + product.id;
      $("posicionCarrusel").textContent = (active + 1) + " / " + n;
    }
    rail.replaceChildren(...slides);
    $("carruselAnterior").onclick = () => show(active - 1);
    $("carruselSiguiente").onclick = () => show(active + 1);
    $("carruselAnterior").disabled = $("carruselSiguiente").disabled = slides.length < 2;
    rail.parentElement.addEventListener("keydown", (event) => {
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
    const region = rail.parentElement;
    let playing = true;
    const toggle = $("pausarCarrusel");
    toggle.hidden = false;
    toggle.onclick = () => {
      playing = !playing;
      toggle.textContent = playing ? "Pausar" : "Reproducir";
    };
    setInterval(() => {
      if (playing && !document.hidden && !details.open && !choice.open && !region.matches(":hover, :focus-within") && region.getBoundingClientRect().bottom > 0) show(active - 1);
    }, 5600);
  }

  function iniciarBusqueda() {
    const search = $("buscarPolo");
    const sort = $("ordenPolo");
    const conMouse = matchMedia("(hover: hover) and (pointer: fine)");

    // Pestanas por coleccion: «Ver todo» y una por cada tema, con su cantidad.
    let tema = "todos";
    const pestanas = [["todos", "Ver todo", data.productos.length]];
    for (const name of new Set(data.productos.map(p => p.tema))) {
      pestanas.push([name, name, data.productos.filter(p => p.tema === name).length]);
    }
    $("coleccionesPolo").replaceChildren(...pestanas.map(([valor, texto, cantidad]) => {
      const b = button(texto, () => { tema = valor; pintar(); });
      b.dataset.tema = valor;
      const n = document.createElement("span");
      n.textContent = cantidad;
      b.append(n);
      return b;
    }));

    const cards = new Map();
    const cerrarTarjetas = [];
    for (const p of data.productos) {
      const a = document.createElement("a");
      a.className = "producto-card";
      a.href = "#/p/" + p.id;
      const media = document.createElement("div");
      media.className = "producto-fotos";
      media.append(image(p.fotos[0], p.nombre));
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
        const capa = image(p.fotos[i], "", false);
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
        const visibles = p.fotos.length > caben ? caben - 1 : p.fotos.length;
        const minis = p.fotos.slice(0, visibles).map((shot, i) => {
          const mini = document.createElement("span");
          mini.className = "producto-mini";
          mini.dataset.foto = i;
          mini.append(image(shot, "", false));
          mini.addEventListener("pointerenter", () => ver(i));
          mini.addEventListener("click", () => { fotoInicial = i; });
          return mini;
        });
        if (p.fotos.length > visibles) {
          const mas = document.createElement("span");
          mas.className = "producto-mini-mas";
          mas.textContent = "+" + (p.fotos.length - visibles);
          minis.push(mas);
        }
        tira.replaceChildren(...minis);
      };
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
      a.addEventListener("click", cerrar);
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
      if (soloFavoritos) list = list.filter(p => favoritos.has(p.id));
      // Una tarjeta que sale de la grilla no recibe «pointerleave»: se cierra antes de moverla.
      for (const cerrar of cerrarTarjetas) cerrar();
      for (const b of $("coleccionesPolo").children) b.setAttribute("aria-pressed", String(b.dataset.tema === tema));
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
      soloFavoritos = false;
      pintar();
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
    $("favoritoFicha").onclick = () => alternarFavorito(selected, "ficha", $("favoritoFicha"));
    pintarContadorFavoritos();
    renderSizeGuide($("guiasCorte"));
    renderSizeGuide($("guiasPanel"));
    iniciarCarrusel();
    iniciarBusqueda();
    entradasAlDesplazar();
    const promo = data.promocion;
    if (promo) {
      $("packLanzamiento").hidden = false;
      $("packLanzamiento").textContent = "Pack de lanzamiento · " + promo.cantidad + " polos por " + price(promo.precio);
    }
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
      if (location.hash.startsWith("#/p/")) location.hash = "#coleccion";
    });
    window.addEventListener("hashchange", route);
    route();
  }
  fetch("data/polos.json?v=nombres-goku-1").then(r => {
    if (!r.ok) throw new Error("Error de catálogo");
    return r.json();
  }).then(init).catch(() => {
    $("grilla").textContent = "No pudimos cargar la colección. Intenta recargar la página.";
  });
})();
