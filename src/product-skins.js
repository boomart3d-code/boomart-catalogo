/* Pack obligatorio: una base y una skin incluida; adicionales dentro del pack. */
(function () {
  "use strict";
  const isProduct = (p) => p?.id === "skins-zelda-nintendo-switch-2";
  const nameOf = (m) => m.name.split("·")[1]?.trim() || m.name;
  const shortLabel = (m) =>
    m.id === "set-11" ? "Base + 11 skins" : `Base + skin · ${nameOf(m)}`;
  const money = (n) => `S/${n}`;
  function mount(host, product, options = {}) {
    if (!host || !isProduct(product) || host.dataset.skinMounted) return;
    const attr = options.attribute || "data-model-option",
      prefix = options.prefix || "";
    const models = product.modelOptions,
      skins = models.filter((m) => !m.addon && m.id !== "set-11");
    const collection = models.find((m) => m.id === "set-11");
    const sourceButtons = [...host.querySelectorAll(`[${attr}]`)];
    if (!skins.length || !collection || sourceButtons.length !== models.length)
      return;
    const params = new URL(location.href).searchParams;
    const initial = options.selectedId || params.get("modelo") || skins[0].id;
    let mode = initial === collection.id ? "all" : "pack",
      stage = "included",
      internal = false;
    let baseId = skins.some((m) => m.id === initial.replace(/^extra-/, ""))
      ? initial.replace(/^extra-/, "")
      : skins[0].id;
    let previewId = mode === "all" ? collection.id : baseId;
    const extras = new Set(
      (params.get("skins") || "")
        .split(",")
        .filter((id) => id !== baseId && skins.some((m) => m.id === id)),
    );
    host.dataset.skinMounted = "true";
    host.classList.remove("pp-thumbs");
    host.removeAttribute("style");
    host.classList.add("skin-picker-host");
    const original = document.createElement("div");
    original.hidden = true;
    while (host.firstChild) original.append(host.firstChild);
    host.append(original);
    if (attr === "data-model-option")
      sourceButtons.forEach(
        (b) =>
          (b.querySelector("span").textContent = shortLabel(
            models.find((m) => m.id === b.getAttribute(attr)),
          )),
      );
    const panel = document.createElement("section");
    panel.className = "skin-picker";
    panel.setAttribute("aria-label", "Configura tu pack Zelda");
    panel.innerHTML = `<div class="skin-modes" role="group" aria-label="Elige tu pack">
      <button type="button" data-skin-mode="pack"><span>Arma tu pack</span><strong data-pack-price></strong></button>
      <button type="button" data-skin-mode="all"><span>Base + 11 skins</span><strong>${money(collection.regularPrice)}</strong></button>
      </div><p class="skin-mode-note"></p>
      <div class="skin-stages" role="group" aria-label="Pasos para elegir diseños"><button type="button" data-skin-stage="included">1. Skin incluida</button><button type="button" data-skin-stage="extras">2. Añadir temáticas</button></div>
      <div class="skin-preview"><button type="button" data-skin-zoom aria-label="Ampliar vista del diseño instalado"><img alt=""><span>Ampliar vista ↗</span></button><div class="skin-preview-caption" role="status" aria-live="polite"><strong data-skin-name></strong><span data-skin-counter></span></div></div>
      <div class="skin-browse"><button type="button" data-skin-step="-1" aria-label="Diseño anterior">‹</button><span data-skin-instruction></span><button type="button" data-skin-step="1" aria-label="Diseño siguiente">›</button></div>
      <div class="skin-swatches" role="group" aria-label="Diseños de skin"></div><div class="skin-chosen" aria-label="Temáticas adicionales elegidas"></div>`;
    host.append(panel);
    const rail = panel.querySelector(".skin-swatches");
    const applyImage = (img, src, kind) =>
      window.BoomArtImages
        ? window.BoomArtImages.apply(img, prefix + src, kind)
        : (img.src = prefix + src);
    skins.forEach((skin, index) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.skinChoice = String(index);
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      applyImage(
        img,
        skin.gallery.find((src) => /-diseno\./.test(src)) || skin.gallery[0],
        "thumb",
      );
      const number = document.createElement("span");
      number.textContent = String(index + 1).padStart(2, "0");
      const check = document.createElement("b");
      check.className = "skin-check";
      check.setAttribute("aria-hidden", "true");
      b.append(img, number, check);
      rail.append(b);
    });
    function selection() {
      const full = mode === "all" || extras.size === skins.length - 1;
      const base = models.find((m) => m.id === baseId);
      const additional = [...extras].sort(
        (a, b) =>
          skins.findIndex((s) => s.id === a) -
          skins.findIndex((s) => s.id === b),
      );
      const total = full
        ? Number(collection.regularPrice)
        : Number(base.regularPrice) +
          additional.reduce(
            (sum, id) =>
              sum +
              Number(models.find((m) => m.id === `extra-${id}`).regularPrice),
            0,
          );
      return {
        baseId: full ? collection.id : baseId,
        extras: full ? [] : additional,
        total,
        keys: full
          ? [collection.id]
          : [baseId, ...additional.map((id) => `extra-${id}`)],
        label: full
          ? "Base + colección completa de 11 skins Zelda"
          : `Pack Zelda · Base + ${nameOf(base)}${additional.length ? ` · Temáticas adicionales: ${additional.map((id) => nameOf(skins.find((m) => m.id === id))).join(", ")}` : ""}`,
        shortLabel: full
          ? "Base + 11 skins"
          : `Base + ${1 + additional.length} skin${additional.length ? "s" : ""}`,
      };
    }
    function sync() {
      const pack = selection();
      if (!host.isConnected) return pack;
      const container = host.closest(".add-to-cart");
      if (container) {
        container.dataset.variant = pack.keys.join(",");
        container.dataset.skinPack = JSON.stringify({
          base: pack.baseId,
          extras: pack.extras,
        });
        container.querySelector("[data-add-to-cart]").dataset.priceLabel =
          `${pack.shortLabel} · ${money(pack.total)}`;
      }
      const context = host.closest("#productModal, .pp-info");
      const setUrl = (raw) => {
        const u = new URL(raw, location.href);
        u.searchParams.set("modelo", pack.baseId);
        u.searchParams.delete("skins");
        if (pack.extras.length)
          u.searchParams.set("skins", pack.extras.join(","));
        return u.toString();
      };
      const shop = context.querySelector("#ppShop");
      if (shop) shop.href = setUrl(shop.href);
      const share = context.querySelector("#ppShare");
      if (share) {
        share.dataset.url = setUrl(share.dataset.url);
        share.dataset.title = `${pack.label} · ${money(pack.total)}`;
      }
      const wa = context.querySelector("#shareProductWa, #ppWhatsapp");
      if (wa) {
        const u = new URL(
          wa.getAttribute("href") ||
            `https://wa.me/${window.BOOMART_CONFIG?.whatsappNumber || "51925666542"}`,
          location.href,
        );
        u.searchParams.set(
          "text",
          `Hola BoomArt, quiero consultar por: ${pack.label} · ${money(pack.total)}`,
        );
        wa.href = u.toString();
      }
      document.dispatchEvent(
        new CustomEvent("boomart:skin-pack", {
          detail: { productId: product.id, pack },
        }),
      );
      return pack;
    }
    function render() {
      const pack = selection(),
        model = models.find((m) => m.id === previewId) || skins[0];
      panel.querySelector("[data-pack-price]").textContent = money(
        extras.size === skins.length - 1
          ? collection.regularPrice
          : Number(skins.find((m) => m.id === baseId).regularPrice) +
              [...extras].reduce(
                (n, id) =>
                  n +
                  Number(
                    models.find((m) => m.id === `extra-${id}`).regularPrice,
                  ),
                0,
              ),
      );
      panel
        .querySelectorAll("[data-skin-mode]")
        .forEach((b) =>
          b.setAttribute("aria-pressed", String(b.dataset.skinMode === mode)),
        );
      panel
        .querySelectorAll("[data-skin-stage]")
        .forEach((b) =>
          b.setAttribute("aria-pressed", String(b.dataset.skinStage === stage)),
        );
      panel.querySelector(".skin-stages").hidden = mode === "all";
      panel.querySelector(".skin-mode-note").textContent =
        pack.baseId === collection.id
          ? `Colección completa: una base + los 11 diseños, ${money(pack.total)}. Consola y dock no incluidos.`
          : `${money(skins.find((m) => m.id === baseId).regularPrice)} + ${extras.size} temática${extras.size === 1 ? "" : "s"} extra × S/20 = ${money(pack.total)}. Consola y dock no incluidos.`;
      const img = panel.querySelector(".skin-preview img");
      applyImage(img, model.gallery[0], "card");
      img.alt =
        previewId === collection.id
          ? "Colección completa de 11 skins Zelda"
          : `${nameOf(model)}: vista de referencia del diseño instalado`;
      panel.querySelector("[data-skin-name]").textContent =
        previewId === collection.id
          ? "Colección Hyrule completa"
          : nameOf(model);
      panel.querySelector("[data-skin-counter]").textContent =
        previewId === collection.id
          ? "11 diseños"
          : `${skins.findIndex((s) => s.id === previewId) + 1} de ${skins.length}`;
      panel.querySelector(".skin-browse").hidden = mode === "all";
      rail.hidden = mode === "all";
      panel.querySelector("[data-skin-instruction]").textContent =
        stage === "included"
          ? "Elige la skin incluida en tus S/50"
          : "Marca las temáticas adicionales · +S/20 c/u";
      rail.querySelectorAll("button").forEach((b, index) => {
        const skin = skins[index],
          included = skin.id === baseId,
          extra = extras.has(skin.id);
        b.setAttribute("aria-pressed", String(included || extra));
        b.dataset.preview = String(skin.id === previewId);
        b.setAttribute(
          "aria-label",
          `${nameOf(skin)}${included ? ": incluida en el pack" : extra ? ": adicional elegida, quitar" : stage === "extras" ? ": añadir al pack por S/20" : ": elegir como incluida"}`,
        );
        const badge = b.querySelector(".skin-check");
        badge.textContent = included ? "1" : extra ? "✓" : "+";
        badge.dataset.included = String(included);
        badge.hidden = stage === "included" && !included && !extra;
      });
      const active = rail.querySelector(
        `[data-skin-choice="${skins.findIndex((s) => s.id === previewId)}"]`,
      );
      if (mode !== "all" && active)
        rail.scrollLeft =
          active.offsetLeft - (rail.clientWidth - active.clientWidth) / 2;
      const chosen = panel.querySelector(".skin-chosen");
      chosen.replaceChildren();
      chosen.hidden = mode === "all" || !extras.size;
      [...extras].forEach((id) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.skinRemove = id;
        b.textContent = `${nameOf(skins.find((m) => m.id === id))} ×`;
        b.setAttribute(
          "aria-label",
          `Quitar temática adicional ${nameOf(skins.find((m) => m.id === id))}`,
        );
        chosen.append(b);
      });
    }
    function choose() {
      internal = true;
      try {
        sourceButtons.find((b) => b.getAttribute(attr) === previewId)?.click();
      } finally {
        internal = false;
      }
      render();
      sync();
    }
    function selectSkin(index) {
      const skin = skins[index];
      previewId = skin.id;
      if (stage === "included") {
        baseId = skin.id;
        extras.delete(baseId);
      } else if (skin.id !== baseId) {
        if (extras.has(skin.id)) extras.delete(skin.id);
        else extras.add(skin.id);
      }
      choose();
    }
    host.addEventListener("click", (event) => {
      const source = event.target.closest(`[${attr}]`);
      if (source) {
        if (!internal) {
          const id = source.getAttribute(attr);
          mode = id === collection.id ? "all" : "pack";
          if (mode === "pack") {
            baseId = id.replace(/^extra-/, "");
            extras.delete(baseId);
          }
          previewId = mode === "all" ? collection.id : baseId;
          render();
          queueMicrotask(sync);
        }
        return;
      }
      if (event.target.closest("[data-skin-zoom]")) {
        const zoom = document.createElement("dialog");
        zoom.className = "skin-zoom";
        zoom.setAttribute("aria-label", "Vista ampliada del diseño elegido");
        zoom.innerHTML =
          '<button type="button" aria-label="Cerrar vista ampliada">×</button><img alt="">';
        const img = zoom.querySelector("img");
        img.alt = panel.querySelector(".skin-preview img").alt;
        applyImage(
          img,
          models.find((m) => m.id === previewId).gallery[0],
          "main",
        );
        zoom
          .querySelector("button")
          .addEventListener("click", () => zoom.close());
        zoom.addEventListener("click", (e) => {
          if (e.target === zoom) zoom.close();
        });
        zoom.addEventListener("close", () => zoom.remove());
        document.body.append(zoom);
        zoom.showModal();
        return;
      }
      const type = event.target.closest("[data-skin-mode]"),
        step = event.target.closest("[data-skin-step]"),
        swatch = event.target.closest("[data-skin-choice]"),
        stageButton = event.target.closest("[data-skin-stage]"),
        remove = event.target.closest("[data-skin-remove]");
      if (type) {
        mode = type.dataset.skinMode;
        previewId = mode === "all" ? collection.id : baseId;
        choose();
      } else if (stageButton) {
        stage = stageButton.dataset.skinStage;
        render();
      } else if (swatch) selectSkin(Number(swatch.dataset.skinChoice));
      else if (step) {
        const index =
          (skins.findIndex((s) => s.id === previewId) +
            Number(step.dataset.skinStep) +
            skins.length) %
          skins.length;
        previewId = skins[index].id;
        choose();
      } else if (remove) {
        extras.delete(remove.dataset.skinRemove);
        render();
        sync();
      }
    });
    rail.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      const index =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? skins.length - 1
            : (skins.findIndex((s) => s.id === previewId) +
                (event.key === "ArrowRight" ? 1 : -1) +
                skins.length) %
              skins.length;
      previewId = skins[index].id;
      choose();
      rail
        .querySelector(`[data-skin-choice="${index}"]`)
        .focus({ preventScroll: true });
    });
    if (options.notice || options.description) {
      const includes = document.createElement("details");
      includes.className = "skin-includes";
      const summary = document.createElement("summary");
      summary.textContent = "Qué incluye y detalles";
      includes.append(summary);
      if (options.notice) includes.append(options.notice);
      if (options.description) includes.append(options.description);
      panel.append(includes);
    }
    host.closest("#modalPricing, .pp-price")?.classList.add("has-skin-picker");
    render();
    sync();
    return { sync };
  }
  window.BoomArtSkinPicker = { isProduct, mount, shortLabel };
})();
