(() => {
  const $ = (id) => document.getElementById(id);
  const wa = (message) => "https://wa.me/51925666542?text=" + encodeURIComponent(message);
  const key = "boomart.polos.seleccion";
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
  let saved = [];
  const price = (amount) => "S/ " + amount;
  const details = $("ficha");
  const choice = $("misPolos");
  function remember() {
    try { localStorage.setItem(key, JSON.stringify(saved)); } catch {}
    $("abrirSeleccion").textContent = "Mi selección (" + saved.length + ")";
  }
  function showShot(index) {
    const photos = selected.fotos;
    shotIndex = (index + photos.length) % photos.length;
    const shot = photos[shotIndex];
    const img = image(shot, selected.nombre + " · " + shot.titulo, false);
    $("fotoFicha").replaceChildren(img);
    $("fotoFicha").href = shot.archivo;
    $("fotoFicha").setAttribute("aria-label", "Abrir imagen al tamaño original");
    $("fotoTexto").textContent = shot.titulo + " · " + (shotIndex + 1) + " de " + photos.length;
    for (const [i, b] of [...$("miniaturas").children].entries()) b.setAttribute("aria-pressed", String(i === shotIndex));
  }
  function configureOrder() {
    const talla = $("tallaFicha").value;
    const entry = CATALOGO_UI.variante(selected, "unisex", talla);
    const pedir = $("pedirPolo");
    if (!talla) return;
    pedir.href = wa("Hola BoomArt. Quiero consultar por " + CATALOGO_UI.mensaje(entry) + ".");
    $("guardarPolo").textContent = saved.some(v => v.clave === entry.clave) ? "Guardado en mi selección" : "Guardar en mi selección";
    $("guardarPolo").onclick = () => {
      if (!saved.some(v => v.clave === entry.clave)) saved.push(entry);
      remember();
      configureOrder();
    };
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
    configureOrder();
    if (!details.open) details.showModal();
  }
  function route() {
    const m = location.hash.match(/^#\/p\/([a-z0-9-]+)(?:\/probador)?$/);
    const product = m && data.productos.find(p => p.id === m[1]);
    if (product) openProduct(product);
    else if (details.open) details.close();
  }
  function displaySelection() {
    const items = $("listaSeleccion");
    items.replaceChildren(...saved.map((v) => {
      const li = document.createElement("li");
      li.append(CATALOGO_UI.mensaje(v), button("Quitar", () => {
        saved = saved.filter(p => p.clave !== v.clave);
        remember();
        displaySelection();
      }));
      return li;
    }));
    $("seleccionVacia").hidden = saved.length > 0;
    $("consultarSeleccion").hidden = saved.length === 0;
    $("consultarSeleccion").href = wa("Hola BoomArt. Quiero consultar por estos polos:\n" + saved.map(CATALOGO_UI.mensaje).join("\n"));
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

  function init(next) {
    data = next;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(stored)) saved = stored.filter(v => v && data.productos.some(p => p.id === v.id && p.tallas.includes(v.talla)));
    } catch {}
    remember();
    $("heroFotos").replaceChildren(...data.productos.slice(0, 2).map(p => {
      const link = document.createElement("a");
      link.className = "hero-polo";
      link.href = "#/p/" + p.id;
      const caption = document.createElement("span");
      caption.textContent = p.nombre;
      link.append(image(p.fotos[0], p.nombre + " · " + p.fotos[0].titulo, false), caption);
      return link;
    }));

    $("grilla").replaceChildren(...data.productos.map(p => {
      const a = document.createElement("a");
      a.className = "producto-card";
      a.href = "#/p/" + p.id;
      const title = document.createElement("h3");
      title.textContent = p.nombre;
      const meta = document.createElement("p");
      meta.textContent = "Polo " + p.color + " · " + price(p.precio);
      a.append(image(p.fotos[0], p.nombre), title, meta);
      return a;
    }));
    entradasAlDesplazar();
    const promo = data.promocion;
    if (promo) {
      $("packLanzamiento").hidden = false;
      $("packLanzamiento").textContent = "Pack de lanzamiento · " + promo.cantidad + " polos por " + price(promo.precio);
    }
    $("abrirSeleccion").onclick = () => { displaySelection(); choice.showModal(); };
    $("anteriorFoto").onclick = () => showShot(shotIndex - 1);
    $("siguienteFoto").onclick = () => showShot(shotIndex + 1);
    $("tallaFicha").onchange = configureOrder;
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
  fetch("data/polos.json?v=travesia-1").then(r => {
    if (!r.ok) throw new Error("Error de catálogo");
    return r.json();
  }).then(init).catch(() => {
    $("grilla").textContent = "No pudimos cargar la colección. Intenta recargar la página.";
  });
})();
