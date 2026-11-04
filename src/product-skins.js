/* Selector visual de skins. Conserva los controles originales como adaptadores
   del carrito y de las fichas estáticas, sin duplicar precios ni variantes. */
(function () {
  "use strict";
  const isProduct = product => product?.id === "skins-zelda-nintendo-switch-2";
  const nameOf = model => model.name.split("·")[1]?.trim() || model.name;
  const shortLabel = model => model.id === "set-11" ? "Base + 11 skins"
    : `${model.addon ? "Skin" : "Base + skin"} · ${nameOf(model)}`;
  const money = amount => `S/${amount}`;
  function mount(host, product, options = {}) {
    if (!host || !isProduct(product) || host.dataset.skinMounted) return;
    const attr = options.attribute || "data-model-option";
    const prefix = options.prefix || "";
    const models = product.modelOptions;
    const skins = models.filter(model => !model.addon && model.id !== "set-11");
    const collection = models.find(model => model.id === "set-11");
    const sourceButtons = [...host.querySelectorAll(`[${attr}]`)];
    if (!skins.length || !collection || sourceButtons.length !== models.length) return;
    host.dataset.skinMounted = "true";
    host.classList.remove("pp-thumbs");
    host.removeAttribute("style");
    host.classList.add("skin-picker-host");
    const original = document.createElement("div");
    original.hidden = true;
    while (host.firstChild) original.append(host.firstChild);
    host.append(original);
    // El carrito lee este texto únicamente para el resumen de la barra fija.
    if (attr === "data-model-option") sourceButtons.forEach(button => {
      const model = models.find(model => model.id === button.getAttribute(attr));
      button.querySelector("span").textContent = shortLabel(model);
    });
    const panel = document.createElement("section");
    panel.className = "skin-picker";
    panel.setAttribute("aria-label", "Personaliza tu skin Zelda");
    panel.innerHTML = `<div class="skin-modes" role="group" aria-label="Qué quieres llevar">
      <button type="button" data-skin-mode="pack"><span>Base + 1 skin</span><strong>${money(skins[0].regularPrice)}</strong></button>
      <button type="button" data-skin-mode="extra"><span>Solo skin</span><strong>${money(models.find(model => model.addon).regularPrice)}</strong></button>
      <button type="button" data-skin-mode="all"><span>Base + 11 skins</span><strong>${money(collection.regularPrice)}</strong></button>
      </div><p class="skin-mode-note"></p>
      <div class="skin-preview"><button type="button" data-skin-zoom aria-label="Ampliar vista del diseño instalado"><img alt=""><span>Ampliar vista ↗</span></button><div class="skin-preview-caption" role="status" aria-live="polite"><strong data-skin-name></strong><span data-skin-counter></span></div></div>
      <div class="skin-browse"><button type="button" data-skin-step="-1" aria-label="Diseño anterior">‹</button><span>Elige el diseño · desliza las miniaturas</span><button type="button" data-skin-step="1" aria-label="Diseño siguiente">›</button></div>
      <div class="skin-swatches" role="group" aria-label="Diseños de skin"></div>`;
    host.append(panel);
    const rail = panel.querySelector(".skin-swatches");
    const applyImage = (image, src, kind) => {
      if (window.BoomArtImages) window.BoomArtImages.apply(image, prefix + src, kind);
      else image.src = prefix + src;
    };
    skins.forEach((skin, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.skinChoice = String(index);
      button.setAttribute("aria-label", `Skin ${index + 1}: ${nameOf(skin)}`);
      const image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      applyImage(image, skin.gallery.find(src => /-diseno\./.test(src)) || skin.gallery[0], "thumb");
      const number = document.createElement("span");
      number.textContent = String(index + 1).padStart(2, "0");
      button.append(image, number);
      rail.append(button);
    });
    let mode = "pack", skinIndex = 0, currentModel;
    const render = id => {
      const model = models.find(model => model.id === id);
      if (!model) return;
      currentModel = model;
      mode = model.id === collection.id ? "all" : model.addon ? "extra" : "pack";
      if (mode !== "all") skinIndex = skins.findIndex(skin => skin.id === model.id.replace(/^extra-/, ""));
      panel.querySelectorAll("[data-skin-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.skinMode === mode)));
      panel.querySelector(".skin-mode-note").textContent = mode === "all" ? "Base impresa + los 11 diseños. Consola y dock no incluidos."
        : mode === "extra" ? "Una skin adicional, sin base. Consola y dock no incluidos."
        : "Base impresa + el diseño elegido. Consola y dock no incluidos.";
      const preview = panel.querySelector(".skin-preview img");
      applyImage(preview, model.gallery[0], "card");
      preview.alt = mode === "all" ? "Colección completa de 11 skins Zelda" : `${nameOf(model)}: vista de referencia del diseño instalado`;
      panel.querySelector("[data-skin-name]").textContent = mode === "all" ? "Colección Hyrule completa" : nameOf(model);
      panel.querySelector("[data-skin-counter]").textContent = mode === "all" ? "11 diseños" : `${skinIndex + 1} de ${skins.length}`;
      panel.querySelector(".skin-browse").hidden = mode === "all";
      rail.hidden = mode === "all";
      rail.querySelectorAll("button").forEach((button, index) => button.setAttribute("aria-pressed", String(mode !== "all" && index === skinIndex)));
      const active = rail.querySelector(`[data-skin-choice="${skinIndex}"]`);
      if (mode !== "all") rail.scrollLeft = active.offsetLeft - rail.offsetLeft - (rail.clientWidth - active.clientWidth) / 2;
    };
    const choose = () => {
      const id = mode === "all" ? collection.id : `${mode === "extra" ? "extra-" : ""}${skins[skinIndex].id}`;
      sourceButtons.find(button => button.getAttribute(attr) === id)?.click();
    };
    host.addEventListener("click", event => {
      if (event.target.closest("[data-skin-zoom]")) {
        const zoom = document.createElement("dialog");
        zoom.className = "skin-zoom";
        zoom.setAttribute("aria-label", "Vista ampliada del diseño elegido");
        zoom.innerHTML = '<button type="button" aria-label="Cerrar vista ampliada">×</button><img alt="">';
        const image = zoom.querySelector("img");
        image.alt = panel.querySelector(".skin-preview img").alt;
        applyImage(image, currentModel.gallery[0], "main");
        zoom.querySelector("button").addEventListener("click", () => zoom.close());
        zoom.addEventListener("click", event => { if (event.target === zoom) zoom.close(); });
        zoom.addEventListener("close", () => zoom.remove());
        document.body.append(zoom);
        zoom.showModal();
        return;
      }
      const source = event.target.closest(`[${attr}]`);
      if (source) { render(source.getAttribute(attr)); return; }
      const type = event.target.closest("[data-skin-mode]");
      const swatch = event.target.closest("[data-skin-choice]");
      const step = event.target.closest("[data-skin-step]");
      if (type) mode = type.dataset.skinMode;
      else if (swatch) skinIndex = Number(swatch.dataset.skinChoice);
      else if (step) skinIndex = (skinIndex + Number(step.dataset.skinStep) + skins.length) % skins.length;
      else return;
      choose();
    });
    rail.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      skinIndex = event.key === "Home" ? 0 : event.key === "End" ? skins.length - 1
        : (skinIndex + (event.key === "ArrowRight" ? 1 : -1) + skins.length) % skins.length;
      choose();
      rail.querySelector(`[data-skin-choice="${skinIndex}"]`).focus({ preventScroll: true });
    });
    if (options.notice || options.description) {
      const includes = document.createElement("details");
      includes.className = "skin-includes";
      const summary = document.createElement("summary");
      summary.textContent = options.description ? "Qué incluye y detalles" : "Qué incluye cada opción";
      includes.append(summary);
      if (options.notice) includes.append(options.notice);
      if (options.description) includes.append(options.description);
      panel.append(includes);
    }
    host.closest("#modalPricing, .pp-price")?.classList.add("has-skin-picker");
    render(options.selectedId || sourceButtons.find(button => button.getAttribute("aria-pressed") === "true")?.getAttribute(attr) || skins[0].id);
  }
  window.BoomArtSkinPicker = { isProduct, mount, shortLabel };
})();
