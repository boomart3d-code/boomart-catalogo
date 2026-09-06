let products = [];
const config = window.BOOMART_CONFIG;

const productGrid = document.querySelector("#productGrid");
const featuredGrid = document.querySelector("#featuredGrid");
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
const modalWhatsapp = document.querySelector("#modalWhatsapp");
const thumbRow = document.querySelector("#thumbRow");
const prevImage = document.querySelector("#prevImage");
const nextImage = document.querySelector("#nextImage");

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

const productMessage = (product) => {
  const price = product.templePricing
    ? `combo ${formatPrice(product.templePricing.combo)} o templo ${formatPrice(product.templePricing.temple)}`
    : `oferta ${formatPrice(product.offerPrice || product.regularPrice)}`;
  return `Hola BoomArt, estoy interesado en ${product.name} (${price}).`;
};

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

const VARIANT_LABELS = { temple: "Templo", pandora: "Pandora Box + pedestal", combo: "Combo (templo + Pandora Box)" };

// Controles para agregar al carrito. Cada tarjeta/modal tiene su propia instancia
// independiente (no comparten estado entre si), identificada por data-product.
// Los templos vienen con el Combo preseleccionado (misma opcion que ya se resalta en
// la tabla de precios de arriba) para que el boton de agregar quede listo de inmediato;
// el cliente puede cambiar a Templo o Pandora Box en cualquier momento antes de agregar.
const DEFAULT_TEMPLE_VARIANT = "combo";

const addToCartMarkup = (product) => {
  const variantPicker = product.templePricing
    ? `
      <div class="variant-select" role="group" aria-label="Elige una opcion para ${product.name}">
        ${Object.keys(product.templePricing)
          .map((key) => {
            const selected = key === DEFAULT_TEMPLE_VARIANT;
            return `
              <button type="button" class="variant-option${selected ? " is-selected" : ""}" data-variant-option="${key}" aria-pressed="${selected}">
                ${VARIANT_LABELS[key]} · ${formatPrice(product.templePricing[key])}
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
  if (product.templePricing) {
    return `
      <div class="temple-price-card">
        <div><span>Templo</span><strong>${formatPrice(product.templePricing.temple)}</strong></div>
        <div><span>Pandora Box + pedestal</span><strong>${formatPrice(product.templePricing.pandora)}</strong></div>
        <div class="combo"><span>Combo</span><strong>${formatPrice(product.templePricing.combo)}</strong></div>
      </div>
    `;
  }

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
        <button class="button dark" type="button" data-open="${product.id}">Ver producto</button>
        <a class="button whatsapp" href="${whatsappUrl(productMessage(product))}" target="_blank" rel="noreferrer">WhatsApp</a>
      </div>
    </div>
  </article>
`;

const renderFilters = () => {
  const categories = ["Todos", "Destacados", "Ofertas", ...new Set(products.map((product) => product.category))];
  filterRow.innerHTML = categories
    .map((category) => `<button class="${category === activeFilter ? "active" : ""}" type="button" data-filter="${category}">${category}</button>`)
    .join("");
};

const matchesProduct = (product) => {
  const query = normalize(searchInput.value);
  const haystack = normalize([product.name, product.category, product.description, product.height, ...(product.tags || [])].join(" "));
  const matchesSearch = !query || haystack.includes(query);
  const matchesFilter =
    activeFilter === "Todos" ||
    (activeFilter === "Destacados" && product.featured) ||
    (activeFilter === "Ofertas" && product.offer) ||
    product.category === activeFilter;
  return matchesSearch && matchesFilter;
};

const renderProducts = () => {
  const visible = products.filter(matchesProduct);
  productGrid.innerHTML = visible.map(productCard).join("");
  resultCount.textContent = `${visible.length} producto${visible.length === 1 ? "" : "s"} visible${visible.length === 1 ? "" : "s"}`;
  emptyState.hidden = visible.length > 0;
};

const renderFeatured = () => {
  featuredGrid.innerHTML = products
    .filter((product) => product.featured)
    .slice(0, 4)
    .map(productCard)
    .join("");
};

const renderShowcase = () => {
  const showcaseProducts = products.filter((product) => product.image).slice(0, 3);
  document.querySelectorAll("[data-showcase]").forEach((node) => {
    const product = showcaseProducts[Number(node.dataset.showcase)];
    if (!product) return;
    node.innerHTML = `
      ${productImage(product)}
      <div>
        <span>${product.category}</span>
        <strong>${product.name}</strong>
      </div>
    `;
  });
};

const setGlobalWhatsapp = () => {
  document.querySelector("#heroWhatsapp").href = whatsappUrl(config.defaultMessage);
  document.querySelector("#offersWhatsapp").href = whatsappUrl("Hola BoomArt, quiero consultar por las promociones disponibles del catálogo.");
  document.querySelector("#footerWhatsapp").href = whatsappUrl(config.defaultMessage);
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

const openProduct = (productId) => {
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
  modalWhatsapp.href = whatsappUrl(productMessage(activeProduct));
  renderModalImage();
  modal.showModal();
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
    activeFilter = filterButton.dataset.filter;
    renderFilters();
    renderProducts();
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
  renderProducts();
});
closeModal.addEventListener("click", () => modal.close());
modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.close();
});
prevImage.addEventListener("click", () => changeImage(-1));
nextImage.addEventListener("click", () => changeImage(1));
document.addEventListener("keydown", (event) => {
  if (!modal.open) return;
  if (event.key === "ArrowLeft") changeImage(-1);
  if (event.key === "ArrowRight") changeImage(1);
});

setGlobalWhatsapp();

document.addEventListener("boomart:products-ready", () => {
  products = window.BOOMART_PRODUCTS || [];
  renderFilters();
  renderFeatured();
  renderProducts();
  renderShowcase();
});
