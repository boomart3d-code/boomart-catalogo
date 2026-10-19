/*
 * Asistente voluntario de compra BoomArt.
 *
 * No se abre solo, no muestra saludos emergentes y no usa IA generativa:
 * recomienda exclusivamente productos vigentes de data/products.json y
 * prepara solicitudes estructuradas para WhatsApp.
 */
(function () {
  "use strict";

  const WHATSAPP_NUMBER = "51925666542";
  const MAX_RESULTS = 3;
  const categoryOrder = [
    "Harry Potter",
    "Saint Seiya",
    "🎃 Halloween",
    "Marvel & DC",
    "Series y Películas",
    "Mundial de Fútbol",
    "Macetas",
    "Soportes de Mandos",
  ];

  const state = {
    screen: "home",
    category: "",
    budget: 0,
    corporateType: "",
    corporateQuantity: "",
    customType: "",
    customReference: "",
  };

  const track = (name, detail) => {
    try {
      if (window.BoomartTrack) window.BoomartTrack.event(name, { d: detail || {} });
    } catch (err) {
      /* La medición nunca debe bloquear el asistente. */
    }
  };

  const normalize = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const escapeHtml = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const productPrice = (product) => {
    if (product.templePricing) return Number(product.templePricing.temple || 0);
    if (product.signPicker) return Number(product.signPicker.unitPrice || 0);
    return Number(product.regularPrice) || 0;
  };

  const priceLabel = (product) => {
    const price = productPrice(product);
    return product.templePricing || product.signPicker ? `Desde S/${price}` : `S/${price}`;
  };

  const productImage = (product) => {
    const image = String(product.image || "");
    if (!image) return "";
    const webp = image.replace(/\.(jpe?g|png)$/i, ".webp");
    return `/${webp.replace(/^\//, "")}`;
  };

  const whatsappLink = (message) =>
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

  const shell = document.createElement("div");
  shell.className = "shopping-assistant";
  shell.innerHTML = `
    <button class="shopping-assistant-toggle" type="button" aria-haspopup="dialog" aria-controls="shoppingAssistantPanel" aria-expanded="false">
      <img class="shopping-assistant-mark" src="/assets/brand/boomart-icon-asistente.png?v=1" alt="" width="30" height="30">
      <span>Te ayudo a elegir</span>
    </button>
    <aside class="shopping-assistant-panel" id="shoppingAssistantPanel" role="dialog" aria-modal="false" aria-labelledby="shoppingAssistantTitle" hidden>
      <header class="shopping-assistant-header">
        <img class="shopping-assistant-header-mark" src="/assets/brand/boomart-icon-asistente.png?v=1" alt="">
        <div class="shopping-assistant-heading"><span class="shopping-assistant-kicker">ASISTENTE BOOMART</span><h2 id="shoppingAssistantTitle">Encuentra o crea tu pieza</h2></div>
        <button type="button" class="shopping-assistant-close" aria-label="Cerrar asistente">×</button>
      </header>
      <div class="shopping-assistant-body" aria-live="polite"></div>
    </aside>
  `;
  document.body.appendChild(shell);

  const toggle = shell.querySelector(".shopping-assistant-toggle");
  const panel = shell.querySelector(".shopping-assistant-panel");
  const body = shell.querySelector(".shopping-assistant-body");
  const closeButton = shell.querySelector(".shopping-assistant-close");

  const currentProducts = () => Array.isArray(window.BOOMART_PRODUCTS)
    ? window.BOOMART_PRODUCTS
    : [];

  let loadedProducts = currentProducts();
  let loadingPromise = null;

  const loadProducts = () => {
    const available = currentProducts();
    if (available.length) {
      loadedProducts = available;
      return Promise.resolve(available);
    }
    if (loadedProducts.length) return Promise.resolve(loadedProducts);
    if (!loadingPromise) {
      loadingPromise = fetch("/data/products.json", { cache: "no-cache" })
        .then((response) => {
          if (!response.ok) throw new Error("No se pudo cargar el catálogo");
          return response.json();
        })
        .then((products) => {
          loadedProducts = Array.isArray(products) ? products : [];
          return loadedProducts;
        })
        .catch(() => {
          loadedProducts = [];
          return [];
        });
    }
    return loadingPromise;
  };

  const option = (action, value, title, detail = "") => `
    <button type="button" class="shopping-assistant-option" data-assistant-action="${action}" data-assistant-value="${escapeHtml(value)}">
      <span>${escapeHtml(title)}</span>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
    </button>
  `;

  const backButton = () => `<button type="button" class="shopping-assistant-back" data-assistant-action="home">← Volver al inicio</button>`;

  const cartAction = () => {
    if (!window.BoomartCart) return "";
    const count = window.BoomartCart.getState().totals.itemCount;
    if (!count) return "";
    return option("checkout", "", `Continuar con mi compra (${count})`, "Revisar el carrito y finalizar el pedido");
  };

  const renderHome = () => {
    state.screen = "home";
    body.innerHTML = `
      <p class="shopping-assistant-intro">Elige una opción y te guiaré sin salir de la página.</p>
      <div class="shopping-assistant-options">
        ${option("catalog", "", "Encontrar un producto", "Según temática y presupuesto")}
        ${option("custom", "", "Crear una pieza personalizada", "A partir de una idea, foto o referencia")}
        ${option("corporate", "", "Pedido para una empresa", "Figuras, trofeos, miniaturas o merchandising")}
        ${cartAction()}
      </div>
      <p class="shopping-assistant-privacy">Este asistente solo funciona cuando tú lo abres. No inicia conversaciones ni envía información automáticamente.</p>
    `;
  };

  const renderCatalogCategories = async () => {
    state.screen = "catalog-category";
    body.innerHTML = `<p class="shopping-assistant-loading"><img src="/assets/brand/boomart-icon-asistente.png?v=1" alt="">Cargando el catálogo…</p>`;
    const products = await loadProducts();
    if (state.screen !== "catalog-category") return;
    const available = new Set(products.map((product) => product.category).filter(Boolean));
    const categories = categoryOrder.filter((category) => available.has(category));
    body.innerHTML = `
      ${backButton()}
      <h3>¿Qué temática prefieres?</h3>
      <div class="shopping-assistant-chips">
        ${categories.map((category) => option("category", category, category)).join("")}
        ${option("category", "Todos", "Sorpréndeme")}
      </div>
    `;
  };

  const renderBudget = () => {
    state.screen = "catalog-budget";
    body.innerHTML = `
      ${backButton()}
      <p class="shopping-assistant-selection">Temática: <strong>${escapeHtml(state.category === "Todos" ? "Cualquiera" : state.category)}</strong></p>
      <h3>¿Cuál es tu presupuesto máximo?</h3>
      <div class="shopping-assistant-chips">
        ${option("budget", "80", "Hasta S/80")}
        ${option("budget", "150", "Hasta S/150")}
        ${option("budget", "250", "Hasta S/250")}
        ${option("budget", "0", "Sin límite")}
      </div>
    `;
  };

  const recommendedProducts = () => {
    const products = loadedProducts.filter((product) => {
      const categoryMatches = state.category === "Todos" || product.category === state.category ||
        (product.extraCategories || []).includes(state.category);
      const price = productPrice(product);
      const budgetMatches = !state.budget || (price > 0 && price <= state.budget);
      return categoryMatches && budgetMatches && price > 0;
    });

    return products
      .sort((a, b) => {
        const featured = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
        if (featured) return featured;
        return productPrice(a) - productPrice(b);
      })
      .slice(0, MAX_RESULTS);
  };

  const resultCard = (product) => {
    const canAdd = Boolean(window.BoomartCart && !product.templePricing && !product.signPicker);
    const canOpenInline = Boolean(document.querySelector("#productModal"));
    const viewControl = canOpenInline
      ? `<button type="button" data-open="${escapeHtml(product.id)}">Ver producto</button>`
      : `<a href="/?producto=${encodeURIComponent(product.id)}" data-assistant-product-link>Ver producto</a>`;
    return `
      <article class="shopping-assistant-product">
        ${productImage(product) ? `<img src="${escapeHtml(productImage(product))}" alt="${escapeHtml(product.name)}" loading="lazy">` : ""}
        <div><h4>${escapeHtml(product.name)}</h4><strong>${escapeHtml(priceLabel(product))}</strong></div>
        <div class="shopping-assistant-product-actions">
          ${viewControl}
          ${canAdd ? `<div class="add-to-cart shopping-assistant-add" data-product="${escapeHtml(product.id)}" data-variant=""><span data-qty-value hidden>1</span><button type="button" data-add-to-cart>Agregar</button></div>` : ""}
        </div>
      </article>
    `;
  };

  const renderResults = () => {
    state.screen = "catalog-results";
    const results = recommendedProducts();
    const fallbackMessage = `Hola BoomArt, busco ${state.category === "Todos" ? "un producto" : `un producto de ${state.category}`}${state.budget ? ` con un presupuesto máximo de S/${state.budget}` : ""}. ¿Qué me recomiendan?`;
    body.innerHTML = `
      ${backButton()}
      <h3>${results.length ? "Estas opciones encajan contigo" : "No encontré una coincidencia exacta"}</h3>
      ${results.length
        ? `<div class="shopping-assistant-results">${results.map(resultCard).join("")}</div>`
        : `<p class="shopping-assistant-intro">Podemos ayudarte personalmente a encontrar una alternativa.</p>`}
      <div class="shopping-assistant-footer-actions">
        <button type="button" class="shopping-assistant-link" data-assistant-action="catalog">Cambiar búsqueda</button>
        <a href="${escapeHtml(whatsappLink(fallbackMessage))}" target="_blank" rel="noopener">Pedir otra recomendación</a>
      </div>
    `;
    track("asistente_recomendacion", { categoria: state.category, presupuesto: state.budget, resultados: results.length });
  };

  const renderCorporateType = () => {
    state.screen = "corporate-type";
    body.innerHTML = `
      ${backButton()}
      <h3>¿Qué necesita tu empresa?</h3>
      <div class="shopping-assistant-options">
        ${option("corporate-type", "Figuras o personajes de marca", "Figuras o personajes", "Mascotas, productos o figuras tipo coleccionable")}
        ${option("corporate-type", "Trofeos o reconocimientos", "Trofeos o reconocimientos")}
        ${option("corporate-type", "Miniaturas o piezas para una caja corporativa", "Miniaturas o cajas corporativas")}
        ${option("corporate-type", "Otro producto personalizado", "Otra idea")}
      </div>
    `;
  };

  const renderCorporateQuantity = () => {
    state.screen = "corporate-quantity";
    body.innerHTML = `
      ${backButton()}
      <p class="shopping-assistant-selection">Proyecto: <strong>${escapeHtml(state.corporateType)}</strong></p>
      <h3>¿Qué cantidad necesitas evaluar?</h3>
      <div class="shopping-assistant-chips">
        ${option("corporate-quantity", "1 a 10 unidades", "1–10")}
        ${option("corporate-quantity", "11 a 50 unidades", "11–50")}
        ${option("corporate-quantity", "más de 50 unidades", "Más de 50")}
        ${option("corporate-quantity", "cantidad por definir", "Aún no lo sé")}
      </div>
    `;
  };

  const renderCorporateFinish = () => {
    state.screen = "corporate-finish";
    const message = `Hola BoomArt, necesito cotizar un proyecto para una empresa.\n\nTipo de pieza: ${state.corporateType}\nCantidad aproximada: ${state.corporateQuantity}\n\nTengo una idea o referencias para compartir. Quisiera que me orienten sobre la información necesaria, viabilidad, precio y plazo.`;
    body.innerHTML = `
      ${backButton()}
      <div class="shopping-assistant-summary"><span>Solicitud preparada</span><strong>${escapeHtml(state.corporateType)}</strong><p>${escapeHtml(state.corporateQuantity)}</p></div>
      <p class="shopping-assistant-intro">Abriremos WhatsApp con estos datos ya escritos. Nada se envía hasta que tú revises y pulses “Enviar”.</p>
      <a class="shopping-assistant-whatsapp" href="${escapeHtml(whatsappLink(message))}" target="_blank" rel="noopener">Continuar por WhatsApp</a>
      <a class="shopping-assistant-secondary-link" href="/merchandising-corporativo/">Ver soluciones para empresas</a>
    `;
  };

  const renderCustomType = () => {
    state.screen = "custom-type";
    body.innerHTML = `
      ${backButton()}
      <h3>¿Qué quieres crear?</h3>
      <div class="shopping-assistant-options">
        ${option("custom-type", "Figura o personaje personalizado", "Figura o personaje")}
        ${option("custom-type", "Casco, máscara o accesorio de cosplay", "Casco, máscara o cosplay")}
        ${option("custom-type", "Objeto decorativo, réplica o pieza especial", "Réplica o pieza especial")}
        ${option("custom-type", "Necesito orientación para definirlo", "Todavía no lo sé")}
      </div>
    `;
  };

  const renderCustomReference = () => {
    state.screen = "custom-reference";
    body.innerHTML = `
      ${backButton()}
      <p class="shopping-assistant-selection">Pieza: <strong>${escapeHtml(state.customType)}</strong></p>
      <h3>¿Tienes imágenes o referencias?</h3>
      <div class="shopping-assistant-chips">
        ${option("custom-reference", "Sí, tengo imágenes o referencias", "Sí, las tengo")}
        ${option("custom-reference", "No, necesito ayuda para definir la idea", "Necesito orientación")}
      </div>
    `;
  };

  const renderCustomFinish = () => {
    state.screen = "custom-finish";
    const message = `Hola BoomArt, quiero consultar por una pieza 3D personalizada.\n\nTipo de pieza: ${state.customType}\nReferencias: ${state.customReference}\n\nQuisiera que me orienten sobre tamaño, materiales, precio y plazo. Sé que debo compartir mi ciudad y las medidas aproximadas para recibir una evaluación.`;
    body.innerHTML = `
      ${backButton()}
      <div class="shopping-assistant-summary"><span>Solicitud preparada</span><strong>${escapeHtml(state.customType)}</strong><p>${escapeHtml(state.customReference)}</p></div>
      <p class="shopping-assistant-intro">WhatsApp se abrirá con un mensaje preparado. Podrás editarlo y adjuntar tus fotografías antes de enviarlo.</p>
      <a class="shopping-assistant-whatsapp" href="${escapeHtml(whatsappLink(message))}" target="_blank" rel="noopener">Continuar por WhatsApp</a>
      <a class="shopping-assistant-secondary-link" href="/impresion-3d-personalizada/">Conocer el proceso personalizado</a>
    `;
  };

  const openAssistant = () => {
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    shell.classList.add("is-open");
    renderHome();
    closeButton.focus({ preventScroll: true });
    track("asistente_abrir");
  };

  const closeAssistant = () => {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    shell.classList.remove("is-open");
    toggle.focus({ preventScroll: true });
  };

  toggle.addEventListener("click", () => panel.hidden ? openAssistant() : closeAssistant());
  closeButton.addEventListener("click", closeAssistant);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) closeAssistant();
  });

  body.addEventListener("click", (event) => {
    const control = event.target.closest("[data-assistant-action]");
    if (!control) return;
    const action = control.dataset.assistantAction;
    const value = control.dataset.assistantValue || "";

    if (action === "home") renderHome();
    if (action === "catalog") renderCatalogCategories();
    if (action === "category") {
      state.category = value;
      renderBudget();
    }
    if (action === "budget") {
      state.budget = Number(value) || 0;
      renderResults();
    }
    if (action === "corporate") renderCorporateType();
    if (action === "corporate-type") {
      state.corporateType = value;
      renderCorporateQuantity();
    }
    if (action === "corporate-quantity") {
      state.corporateQuantity = value;
      renderCorporateFinish();
    }
    if (action === "custom") renderCustomType();
    if (action === "custom-type") {
      state.customType = value;
      renderCustomReference();
    }
    if (action === "custom-reference") {
      state.customReference = value;
      renderCustomFinish();
    }
    if (action === "checkout") {
      closeAssistant();
      const cartButton = document.querySelector("#cartToggle") || document.querySelector("#cartFloatToggle");
      if (cartButton) cartButton.click();
    }
  });

  body.addEventListener("click", (event) => {
    if (event.target.closest("[data-open]") || event.target.closest("[data-assistant-product-link]") || event.target.closest("[data-add-to-cart]")) {
      track("asistente_producto", { accion: event.target.closest("[data-add-to-cart]") ? "agregar" : "ver" });
      if (event.target.closest("[data-open]") || event.target.closest("[data-assistant-product-link]")) closeAssistant();
    }
  });

  document.addEventListener("boomart:products-ready", () => {
    loadedProducts = currentProducts();
  });
})();
