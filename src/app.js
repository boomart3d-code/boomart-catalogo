let products = [];
const config = window.BOOMART_CONFIG;

const productGrid = document.querySelector("#productGrid");
const filterRow = document.querySelector("#filterRow");
const searchInput = document.querySelector("#searchInput");
const resultCount = document.querySelector("#resultCount");
const emptyState = document.querySelector("#emptyState");
const clearFilters = document.querySelector("#clearFilters");
const modal = document.querySelector("#productModal");
const closeModal = document.querySelector("#closeModal");
const modalImageWrap = document.querySelector("#modalImageWrap");
const modalTitle = document.querySelector("#modalTitle");
const modalCategory = document.querySelector("#modalCategory");
const modalDescription = document.querySelector("#modalDescription");
const modalDetails = document.querySelector("#modalDetails");
const modalPricing = document.querySelector("#modalPricing");
const thumbRow = document.querySelector("#thumbRow");
const prevImage = document.querySelector("#prevImage");
const nextImage = document.querySelector("#nextImage");
const modalBack = document.querySelector("#modalBack");
const shareProductBtn = document.querySelector("#shareProduct");
const shareProductWa = document.querySelector("#shareProductWa");
const shareFeedback = document.querySelector("#shareFeedback");

let activeFilter = "Todos";
let activeProduct = null;
let activeImageIndex = 0;

const formatPrice = (value) => `S/${value}`;

const normalize = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const whatsappUrl = (message) =>
  config.whatsappLink
    ? `${config.whatsappLink}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(message)}`;

// --- Enlace directo a un producto: ?producto=<id> ---------------------------
// Al abrir una ficha la URL pasa a boomart.pe/?producto=<id>; al compartir ese
// enlace, la pagina carga normal y abre solo ese producto. No toca products.json
// ni el resto de funciones: es historial del navegador + un parametro.
const PRODUCT_PARAM = "producto";

const priceLabel = (product) => {
  if (product.templePricing) {
    const v = product.templePricing.temple ?? product.templePricing.combo ?? product.templePricing.pandora;
    return v ? `desde S/${v}` : "";
  }
  const now = product.offerPrice || product.regularPrice;
  return now ? `S/${now}` : "";
};

const productShareUrl = (productId) => {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set(PRODUCT_PARAM, productId);
  return url.toString();
};

const shareText = (product) => {
  const price = priceLabel(product);
  return `${product.name}${price ? ` — ${price}` : ""}`;
};

const shareProduct = async (product) => {
  const url = productShareUrl(product.id);
  if (navigator.share) {
    try {
      await navigator.share({ title: product.name, text: `${shareText(product)}\n${url}`, url });
      if (window.gtag) gtag("event", "share", { method: "web_share", item_id: product.id });
    } catch (err) {
      /* el usuario cerro el menu de compartir: no es un error */
    }
    return "shared";
  }
  if (await copyText(url)) {
    if (window.gtag) gtag("event", "share", { method: "copy", item_id: product.id });
    return "copied";
  }
  return "failed";
};

// Copia texto al portapapeles con respaldo para navegadores sin permiso de
// Clipboard API (mismo truco que usa checkout.js para el numero de Yape/Plin).
const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    try {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "absolute";
      helper.style.left = "-9999px";
      document.body.appendChild(helper);
      helper.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(helper);
      return ok;
    } catch (err2) {
      return false;
    }
  }
};

const whatsappShareUrl = (product) =>
  `https://wa.me/?text=${encodeURIComponent(`${shareText(product)}\n${productShareUrl(product.id)}`)}`;

const placeholder = (product) => `
  <div class="image-placeholder" role="img" aria-label="Imagen pendiente para ${product.name}">
    <span>BOOM ART</span>
    <strong>${product.name}</strong>
    <small>Imagen pendiente</small>
  </div>
`;

const productImage = (product, className = "") => {
  if (!product.image) return placeholder(product);
  return `<img class="${className}" src="${product.image}" alt="${product.name}" loading="lazy">`;
};

const TEMPLE_BOX_LABELS = { temple: "Templo", pandora: "Pandora Box + pedestal", combo: "Combo" };

// Controles para agregar al carrito. Cada tarjeta/modal tiene su propia instancia
// independiente (no comparten estado entre si), identificada por data-product.
// Los templos vienen con el Combo preseleccionado (misma opcion que ya se resalta en
// la tabla de precios de arriba) para que el boton de agregar quede listo de inmediato;
// el cliente puede cambiar a Templo o Pandora Box en cualquier momento antes de agregar.
const DEFAULT_TEMPLE_VARIANT = "combo";

const addToCartMarkup = (product) => {
  const variantPicker = product.templePricing
    ? `
      <div class="temple-price-card" role="group" aria-label="Elige una opcion para ${product.name}">
        ${Object.keys(product.templePricing)
          .map((key) => {
            const selected = key === DEFAULT_TEMPLE_VARIANT;
            return `
              <button type="button" class="temple-price-option${selected ? " is-selected" : ""}" data-variant-option="${key}" aria-pressed="${selected}">
                <span>${TEMPLE_BOX_LABELS[key]}</span>
                <strong>${formatPrice(product.templePricing[key])}</strong>
              </button>
            `;
          })
          .join("")}
      </div>
    `
    : "";

  const initialVariant = product.templePricing ? DEFAULT_TEMPLE_VARIANT : "";

  return `
    <div class="add-to-cart" data-product="${product.id}" data-variant="${initialVariant}">
      ${variantPicker}
      <div class="add-to-cart-row">
        <div class="qty-stepper" role="group" aria-label="Cantidad">
          <button type="button" class="qty-btn" data-qty-decrease aria-label="Quitar una unidad">−</button>
          <span class="qty-value" data-qty-value>1</span>
          <button type="button" class="qty-btn" data-qty-increase aria-label="Agregar una unidad">+</button>
        </div>
        <button type="button" class="button primary add-to-cart-btn" data-add-to-cart>
          Agregar al carrito
        </button>
      </div>
    </div>
  `;
};

const priceMarkup = (product) => {
  // Los templos ya muestran su precio dentro de addToCartMarkup(), como parte
  // del propio selector de Templo/Pandora Box/Combo (evita repetir la misma
  // informacion dos veces en la tarjeta).
  if (product.templePricing) return "";

  return `
    <div class="simple-price">
      ${product.regularPrice ? `<del>${formatPrice(product.regularPrice)}</del>` : ""}
      <strong>${formatPrice(product.offerPrice || product.regularPrice)}</strong>
    </div>
  `;
};

const productCard = (product) => `
  <article class="product-card">
    <button class="card-media" type="button" data-open="${product.id}" aria-label="Ver ${product.name}">
      ${product.offer ? '<span class="badge">Oferta</span>' : ""}
      ${productImage(product)}
    </button>
    <div class="card-body">
      <div>
        <p class="product-category">${product.category}</p>
        <h3>${product.name}</h3>
        <p>${product.description}</p>
      </div>
      ${priceMarkup(product)}
      ${addToCartMarkup(product)}
      <div class="card-actions">
        <button class="button dark full" type="button" data-open="${product.id}">Ver producto</button>
        <button class="button ghost full card-share-btn" type="button" data-share="${product.id}" aria-label="Compartir ${product.name}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15V3m0 0L8 7m4-4 4 4M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Compartir
        </button>
      </div>
    </div>
  </article>
`;

// Sección de temporada: si existe la categoría "🎃 Halloween" va primero en la
// franja (y resaltada en naranja vía CSS). Para archivarla al terminar la
// temporada, cambia la categoría de esos productos en el panel.
const SEASON_LABEL = "🎃 Halloween";

// La franja muestra las categorías reales. "Todos" es el estado por defecto
// (sin categoría activa) y se vuelve a él tocando "Limpiar filtros" o volviendo
// a tocar la categoría ya activa.
const catalogCategories = () => {
  const cats = [...new Set(products.map((product) => product.category))];
  const i = cats.indexOf(SEASON_LABEL);
  if (i > 0) cats.unshift(...cats.splice(i, 1));
  return cats;
};

const renderFilters = () => {
  filterRow.innerHTML = catalogCategories()
    .map((category) => `<button class="${category === activeFilter ? "active" : ""}" type="button" data-filter="${category}">${category}</button>`)
    .join("");
};

const quickCategoriesPanel = document.querySelector("#quickCategoriesPanel");

const renderQuickCategories = () => {
  quickCategoriesPanel.innerHTML = catalogCategories()
    .map((category) => `<button class="${category === activeFilter ? "active" : ""}" type="button" data-filter="${category}">${category}</button>`)
    .join("");
};

const matchesProduct = (product) => {
  const query = normalize(searchInput.value);
  const haystack = normalize([product.name, product.category, product.description, product.height, ...(product.tags || [])].join(" "));
  const matchesSearch = !query || haystack.includes(query);
  const matchesFilter = activeFilter === "Todos" || product.category === activeFilter;
  return matchesSearch && matchesFilter;
};

const renderProducts = () => {
  const visible = products.filter(matchesProduct);
  productGrid.innerHTML = visible.map(productCard).join("");
  resultCount.textContent = `${visible.length} producto${visible.length === 1 ? "" : "s"} visible${visible.length === 1 ? "" : "s"}`;
  emptyState.hidden = visible.length > 0;
};

const setGlobalWhatsapp = () => {
  const setHref = (selector, message) => {
    const node = document.querySelector(selector);
    if (node) node.href = whatsappUrl(message);
  };
  setHref("#offersWhatsapp", "Hola BoomArt, quiero consultar por las promociones disponibles del catálogo.");
  setHref("#footerWhatsapp", config.defaultMessage);
};

const renderModalImage = () => {
  const gallery = activeProduct.gallery.length ? activeProduct.gallery : [activeProduct.image].filter(Boolean);
  const current = gallery[activeImageIndex];
  modalImageWrap.innerHTML = current
    ? `<img src="${current}" alt="${activeProduct.name} imagen ${activeImageIndex + 1}">`
    : placeholder(activeProduct);

  thumbRow.innerHTML = gallery
    .map((image, index) => `<button class="${index === activeImageIndex ? "active" : ""}" type="button" data-thumb="${index}"><img src="${image}" alt=""></button>`)
    .join("");

  const hasMultiple = gallery.length > 1;
  prevImage.hidden = !hasMultiple;
  nextImage.hidden = !hasMultiple;
};

const openProduct = (productId, fromHistory = false) => {
  activeProduct = products.find((product) => product.id === productId);
  if (!activeProduct) return;

  activeImageIndex = 0;
  modalTitle.textContent = activeProduct.name;
  modalCategory.textContent = activeProduct.category;
  modalDescription.textContent = activeProduct.description;
  modalDetails.innerHTML = `
    ${activeProduct.height ? `<div><span>Altura</span><strong>${activeProduct.height}</strong></div>` : ""}
    <div><span>Material</span><strong>${activeProduct.material}</strong></div>
    <div><span>Disponibilidad</span><strong>${activeProduct.availability}</strong></div>
  `;
  modalPricing.innerHTML = priceMarkup(activeProduct) + addToCartMarkup(activeProduct);
  if (shareProductWa) shareProductWa.href = whatsappShareUrl(activeProduct);
  if (shareFeedback) shareFeedback.hidden = true;
  renderModalImage();
  if (!modal.open) modal.showModal();

  // Refleja el producto en la URL para poder copiarla / compartirla.
  const current = new URL(window.location.href).searchParams.get(PRODUCT_PARAM);
  if (!fromHistory && current !== productId) {
    history.pushState({ [PRODUCT_PARAM]: productId }, "", productShareUrl(productId));
  }
};

const stripProductParam = () => {
  const url = new URL(window.location.href);
  if (url.searchParams.has(PRODUCT_PARAM)) {
    url.searchParams.delete(PRODUCT_PARAM);
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  }
};

const closeProductModal = () => {
  if (modal.open) modal.close();
  activeProduct = null;
};

// Cierra la ficha y limpia el ?producto= de la URL. Todas las vias de cierre
// (boton X, "seguir viendo", fondo, agregar al carrito, Escape) pasan por aqui.
const dismissProduct = () => {
  if (history.state && history.state[PRODUCT_PARAM]) {
    history.back(); // dispara popstate -> cierra la ficha y restaura la URL
  } else {
    closeProductModal();
    stripProductParam();
  }
};

const changeImage = (direction) => {
  const gallery = activeProduct.gallery.length ? activeProduct.gallery : [activeProduct.image].filter(Boolean);
  if (gallery.length < 2) return;
  activeImageIndex = (activeImageIndex + direction + gallery.length) % gallery.length;
  renderModalImage();
};

document.addEventListener("click", (event) => {
  const openButton = event.target.closest("[data-open]");
  const filterButton = event.target.closest("[data-filter]");
  const thumbButton = event.target.closest("[data-thumb]");

  if (openButton) openProduct(openButton.dataset.open);
  if (filterButton) {
    const fromQuickPanel = Boolean(filterButton.closest("#quickCategoriesPanel"));
    const clicked = filterButton.dataset.filter;
    // Tocar la categoría que ya está activa la desactiva (vuelve a "Todos").
    activeFilter = clicked === activeFilter ? "Todos" : clicked;
    if (fromQuickPanel) {
      // Seleccionar una categoria desde el panel rapido es una navegacion nueva:
      // se limpia cualquier busqueda de texto que hubiera quedado activa para
      // que no filtre en silencio los resultados de la categoria elegida.
      searchInput.value = "";
      quickSearchInput.value = "";
    }
    renderFilters();
    renderQuickCategories();
    renderProducts();
    if (fromQuickPanel) {
      closeQuickCategories();
      productGrid.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  if (thumbButton) {
    activeImageIndex = Number(thumbButton.dataset.thumb);
    renderModalImage();
  }
});

searchInput.addEventListener("input", renderProducts);
clearFilters.addEventListener("click", () => {
  activeFilter = "Todos";
  searchInput.value = "";
  renderFilters();
  renderQuickCategories();
  renderProducts();
});

const quickCategoriesToggle = document.querySelector("#quickCategoriesToggle");
const closeQuickCategories = () => {
  quickCategoriesPanel.hidden = true;
  quickCategoriesToggle.setAttribute("aria-expanded", "false");
};
quickCategoriesToggle.addEventListener("click", () => {
  const willOpen = quickCategoriesPanel.hidden;
  closeQuickSearch();
  quickCategoriesPanel.hidden = !willOpen;
  quickCategoriesToggle.setAttribute("aria-expanded", String(willOpen));
});
document.addEventListener("click", (event) => {
  if (quickCategoriesPanel.hidden) return;
  if (event.target.closest("#quickCategoriesPanel") || event.target.closest("#quickCategoriesToggle")) return;
  closeQuickCategories();
});

const quickSearchToggle = document.querySelector("#quickSearchToggle");
const quickSearchBox = document.querySelector("#quickSearchBox");
const quickSearchInput = document.querySelector("#quickSearchInput");
const closeQuickSearch = () => {
  quickSearchBox.hidden = true;
  quickSearchToggle.setAttribute("aria-expanded", "false");
};
quickSearchToggle.addEventListener("click", () => {
  const willOpen = quickSearchBox.hidden;
  closeQuickCategories();
  quickSearchBox.hidden = !willOpen;
  quickSearchToggle.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) {
    quickSearchInput.value = searchInput.value;
    quickSearchInput.focus();
  }
});
quickSearchInput.addEventListener("input", () => {
  searchInput.value = quickSearchInput.value;
  renderProducts();
});
quickSearchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  quickSearchInput.blur();
  closeQuickSearch();
  productGrid.scrollIntoView({ behavior: "smooth", block: "start" });
});
document.addEventListener("click", (event) => {
  if (quickSearchBox.hidden) return;
  if (event.target.closest("#quickSearchBox") || event.target.closest("#quickSearchToggle")) return;
  closeQuickSearch();
});

document.querySelector("#quickTopBtn").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});
closeModal.addEventListener("click", dismissProduct);
if (modalBack) modalBack.addEventListener("click", dismissProduct);
modal.addEventListener("click", (event) => {
  if (event.target === modal) dismissProduct();
});
// Escape: se cancela el cierre nativo del <dialog> y se pasa por dismissProduct
// para que la URL quede limpia (?producto= fuera).
modal.addEventListener("cancel", (event) => {
  event.preventDefault();
  dismissProduct();
});
// Cierre desde otro modulo (checkout.js al agregar al carrito).
document.addEventListener("boomart:dismiss-product", dismissProduct);
prevImage.addEventListener("click", () => changeImage(-1));
nextImage.addEventListener("click", () => changeImage(1));
document.addEventListener("keydown", (event) => {
  if (!modal.open) return;
  if (event.key === "ArrowLeft") changeImage(-1);
  if (event.key === "ArrowRight") changeImage(1);
});

// Boton "Compartir" del modal.
if (shareProductBtn) {
  shareProductBtn.addEventListener("click", async () => {
    if (!activeProduct) return;
    const result = await shareProduct(activeProduct);
    if (result === "copied" && shareFeedback) {
      shareFeedback.textContent = "Enlace copiado ✓";
      shareFeedback.hidden = false;
      setTimeout(() => { shareFeedback.hidden = true; }, 2600);
    } else if (result === "failed" && shareFeedback) {
      shareFeedback.textContent = "No se pudo copiar";
      shareFeedback.hidden = false;
      setTimeout(() => { shareFeedback.hidden = true; }, 2600);
    }
  });
}

// Boton "Compartir" en las tarjetas del catalogo.
document.addEventListener("click", async (event) => {
  const shareBtn = event.target.closest("[data-share]");
  if (!shareBtn) return;
  const product = products.find((p) => p.id === shareBtn.dataset.share);
  if (!product) return;
  const result = await shareProduct(product);
  if (result === "copied" || result === "failed") {
    const textNode = [...shareBtn.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (textNode) {
      const prevText = textNode.textContent;
      shareBtn.classList.add("is-copied");
      textNode.textContent = result === "copied" ? " Enlace copiado ✓" : " No se pudo copiar";
      setTimeout(() => {
        shareBtn.classList.remove("is-copied");
        textNode.textContent = prevText;
      }, 2200);
    }
  }
});

// Botones "atras" / "adelante" del navegador: abrir o cerrar la ficha segun la URL.
window.addEventListener("popstate", () => {
  const id = new URL(window.location.href).searchParams.get(PRODUCT_PARAM);
  if (id && products.find((p) => p.id === id)) {
    openProduct(id, true);
  } else {
    closeProductModal();
  }
});

setGlobalWhatsapp();

document.addEventListener("boomart:products-ready", () => {
  products = window.BOOMART_PRODUCTS || [];
  renderFilters();
  renderQuickCategories();
  renderProducts();

  // Si se entro con un enlace directo a un producto, abrir esa ficha.
  const id = new URL(window.location.href).searchParams.get(PRODUCT_PARAM);
  if (id && products.find((p) => p.id === id)) openProduct(id, true);
});
