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
  let shotIndex = 0;
  const price = (amount) => "S/ " + amount;
  const details = $("ficha");
  function showShot(index) {
    const photos = selected.fotos;
    shotIndex = (index + photos.length) % photos.length;
    const shot = photos[shotIndex];
    const img = image(shot, selected.nombre + " · " + shot.titulo, false);
    $("fotoFicha").replaceChildren(img);
    $("fotoFicha").onclick = () => {
      $("fotoAmpliada").replaceChildren(img.cloneNode());
      $("visorPolo").showModal();
    };
    $("fotoTexto").textContent = shot.titulo + " · " + (shotIndex + 1) + " de " + photos.length;
    for (const [i, b] of [...$("miniaturas").children].entries()) b.setAttribute("aria-pressed", String(i === shotIndex));
  }
  function openProduct(product) {
    selected = product;
    $("temaFicha").textContent = product.tema;
    $("nombreFicha").textContent = product.nombre;
    $("precioFicha").textContent = price(product.precio) + " por unidad";
    $("descripcionFicha").textContent = product.texto;
    $("materialFicha").textContent = product.material;
    $("colorFicha").textContent = "Polo " + product.color + " · Corte unisex";
    $("tallaFicha").replaceChildren(...product.tallas.map(t => new Option(t, t)));
    $("miniaturas").replaceChildren(...product.fotos.map((shot, i) => {
      const b = button("", () => showShot(i));
      b.setAttribute("aria-label", shot.titulo);
      b.append(image(shot, ""));
      return b;
    }));
    showShot(0);
    if (!details.open) details.showModal();
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
    for (const node of document.querySelectorAll(".producto-card, #proceso .proceso article, #prenda .prenda-grid article")) {
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
    const themes = $("coleccionPolo");
    const sort = $("ordenPolo");
    for (const name of new Set(data.productos.map(p => p.tema))) themes.add(new Option(name, name));
    const cards = new Map();
    for (const p of data.productos) {
      const a = document.createElement("a");
      a.className = "producto-card";
      a.href = "#/p/" + p.id;
      const title = document.createElement("h3");
      title.textContent = p.nombre;
      const meta = document.createElement("p");
      meta.textContent = p.tema + " · " + price(p.precio);
      const action = document.createElement("span");
      action.className = "accion-tarjeta";
      action.textContent = "Ver polo →";
      const media = document.createElement("div");
      media.className = "producto-fotos";
      media.append(image(p.fotos[0], p.nombre));
      if (p.fotos[1] && matchMedia("(any-hover: hover) and (any-pointer: fine)").matches) {
        media.addEventListener("pointerenter", (event) => {
          if (event.pointerType !== "mouse" || media.querySelector(".producto-foto-siguiente")) return;
          const preview = image(p.fotos[1], "", false);
          preview.className = "producto-foto-siguiente";
          preview.setAttribute("aria-hidden", "true");
          media.append(preview);
          preview.decode().then(() => preview.classList.add("lista")).catch(() => preview.remove());
        });
      }
      a.append(media, title, meta, action);
      cards.set(p.id, a);
    }
    function pintar() {
      const list = CATALOGO_UI.filtrar(data.productos, {busqueda: search.value, tema: themes.value, orden: sort.value});
      $("grilla").replaceChildren(...list.map(p => cards.get(p.id)));
      $("resultadoPolos").textContent = list.length === 1 ? "1 polo" : list.length + " polos";
      $("sinPolos").hidden = list.length !== 0;
    }
    search.addEventListener("input", pintar);
    themes.addEventListener("change", pintar);
    sort.addEventListener("change", pintar);
    $("limpiarPolos").onclick = () => {
      search.value = "";
      themes.value = "todos";
      sort.value = "";
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
      image: cartPhoto(p).archivo, tallas: p.tallas
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
    iniciarCarrusel();
    iniciarBusqueda();
    entradasAlDesplazar();
    const promo = data.promocion;
    if (promo) {
      $("packLanzamiento").hidden = false;
      $("packLanzamiento").textContent = "Pack de lanzamiento · " + promo.cantidad + " polos por " + price(promo.precio);
    }
    $("agregarPolo").onclick = () => {
      window.BoomartCart.add(selected.id, $("tallaFicha").value, 1);
      details.close();
      $("cartToggle").click();
    };
    $("anteriorFoto").onclick = () => showShot(shotIndex - 1);
    $("siguienteFoto").onclick = () => showShot(shotIndex + 1);
    details.addEventListener("keydown", (e) => {
      if (e.target.tagName === "SELECT") return;
      if (e.key === "ArrowLeft") showShot(shotIndex - 1);
      if (e.key === "ArrowRight") showShot(shotIndex + 1);
    });
    details.addEventListener("close", () => {
      if (location.hash.startsWith("#/p/")) location.hash = "#coleccion";
    });
    window.addEventListener("hashchange", route);
    route();
  }
  fetch("data/polos.json?v=shun-1").then(r => {
    if (!r.ok) throw new Error("Error de catálogo");
    return r.json();
  }).then(init).catch(() => {
    $("grilla").textContent = "No pudimos cargar la colección. Intenta recargar la página.";
  });
})();
