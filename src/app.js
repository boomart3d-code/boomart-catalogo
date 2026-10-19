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
// Avisos fijos por categoría (2026-10-18): los soportes de mando NO incluyen el mando.
// Un producto también puede traer su propio "notice" en products.json.
const CATEGORY_NOTICES = { "Soportes de Mandos": "No incluye el mando: solo se vende el soporte." };
const productNotice = (product) => product.notice || CATEGORY_NOTICES[product.category] || "";
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

// La tienda muestra .webp (mas liviano); el .jpg original se conserva tal
// cual para que og:image (WhatsApp/Facebook) siga funcionando -- ver
// scripts/optimize-images.mjs. Si algun producto todavia no tiene su .webp
// generado, esto simplemente pediria un archivo que no existe: por eso solo
// se aplica a assets/products/, donde ya se genero para todas las fotos.
const webpSrc = (src) =>
  src && src.startsWith("assets/products/") ? src.replace(/\.(jpe?g|png)$/i, ".webp") : src;

const normalize = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// Medicion propia (src/track.js). Siempre opcional: si no cargo, no pasa nada.
const trackEvt = (name, props) => {
  try {
    if (window.BoomartTrack) window.BoomartTrack.event(name, props);
  } catch (e) { /* medir nunca debe romper la tienda */ }
};

// Siempre con el numero directo: el enlace corto wa.me/message/... descarta el
// parametro ?text= (WhatsApp lo ignora y el chat se abre vacio).
const whatsappUrl = (message) =>
  `https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(message)}`;

// Mensaje corto del cliente hacia BoomArt consultando por un producto. Mismo
// texto que usan las paginas /producto/<id>/ (waLink en build-ai-catalog.mjs).
const inquiryMessage = (product) => `Hola BoomArt, quiero consultar por: ${product.name}`;

// --- Enlace directo a un producto: ?producto=<id> ---------------------------
// Al abrir una ficha la URL pasa a boomart.pe/?producto=<id>; asi el historial
// del navegador abre/cierra la ficha. No toca products.json.
const PRODUCT_PARAM = "producto";
const SITE_ORIGIN = "https://boomart.pe";

// --- Enlace corto de campana: ?categoria=<slug> (ej. boomart.pe/saintseiya,
// que redirige a /?categoria=saint-seiya#catalogo) -- pedido de Adrian,
// 2026-09-29, para el video de octubre. Mismo slug que usan las paginas
// estaticas /categoria/<slug>/ generadas por build-ai-catalog.mjs (ver
// funcion "slug" ahi): sin tildes, minusculas, no-alfanumerico a guion.
const CATEGORY_PARAM = "categoria";
const slugifyCategory = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// Cada producto tiene una pagina estatica propia e indexable en
// /producto/<id>/ (titulo, descripcion y OG propios). Esa es la URL que se
// comparte y la que se declara como canonical mientras la ficha esta abierta,
// para que Google indexe esa pagina y no boomart.pe/?producto=<id>.
const productPageUrl = (productId) =>
  `${SITE_ORIGIN}/producto/${encodeURIComponent(productId)}/`;

const canonicalLink = document.querySelector('link[rel="canonical"]');
const setCanonical = (href) => {
  if (canonicalLink) canonicalLink.setAttribute("href", href);
};

const priceLabel = (product) => {
  if (product.signPicker) return `desde S/${product.signPicker.unitPrice}`;
  if (product.templePricing) {
    const v = product.templePricing.temple ?? product.templePricing.combo ?? product.templePricing.pandora;
    return v ? `desde S/${v}` : "";
  }
  const now = product.regularPrice;
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

// En escritorio copiamos directamente: el menu de Windows no garantiza que
// su opcion "Copiar enlace" escriba en el portapapeles. En tactil mantenemos
// el menu nativo para elegir una app de destino.
const useNativeShare = () =>
  typeof navigator.share === "function" &&
  window.matchMedia("(hover: none) and (pointer: coarse)").matches;

const shareButtonLabel = () => useNativeShare() ? "Compartir" : "Copiar enlace";

if (shareProductBtn) {
  const label = [...shareProductBtn.childNodes].find((node) =>
    node.nodeType === 3 && node.textContent.trim());
  if (label) label.textContent = ` ${shareButtonLabel()} `;
  shareProductBtn.setAttribute("aria-label", `${shareButtonLabel()} de este producto`);
}

// Enlace para compartir: la página del producto + ?src=compartir. Además de
// medir las visitas que llegan por enlaces compartidos (src/track.js), evita
// que WhatsApp reuse una vista previa vieja guardada para el enlace "pelado"
// (antes del 2026-10-15 la miniatura era un PNG pesado que no mostraba).
// La dirección canónica para Google sigue siendo /producto/<id>/.
const SHARE_SRC = "compartir";

const shareProduct = async (product) => {
  const url = `${productPageUrl(product.id)}?src=${SHARE_SRC}`;
  if (useNativeShare()) {
    try {
      await navigator.share({ title: product.name, text: shareText(product), url });
      if (window.gtag) gtag("event", "share", { method: "web_share", item_id: product.id });
      trackEvt("compartir", { p: product.id, o: "menu" });
      return "shared";
    } catch (err) {
      if (err.name === "AbortError") return "cancelled";
      // Si el navegador no permite compartir, intentar la copia directa.
    }
  }
  if (await copyText(url)) {
    if (window.gtag) gtag("event", "share", { method: "copy", item_id: product.id });
    trackEvt("compartir", { p: product.id, o: "copiar" });
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
    const previousFocus = document.activeElement;
    const helper = document.createElement("textarea");
    try {
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.top = "0";
      helper.style.left = "0";
      helper.style.width = "1px";
      helper.style.height = "1px";
      helper.style.opacity = "0";
      // Un dialogo modal vuelve inerte el body: el campo temporal debe estar
      // dentro del dialogo para que realmente pueda recibir foco y seleccion.
      const host = previousFocus?.closest("dialog[open]") || document.body;
      host.appendChild(helper);
      helper.focus({ preventScroll: true });
      helper.select();
      helper.setSelectionRange(0, text.length);
      return document.activeElement === helper && document.execCommand("copy");
    } catch (err2) {
      return false;
    } finally {
      helper.remove();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    }
  }
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
  return `<img class="${className}" src="${webpSrc(product.image)}" alt="${product.name}" loading="lazy" decoding="async">`;
};

const TEMPLE_BOX_LABELS = { temple: "Templo", pandora: "Pandora Box + pedestal", combo: "Combo" };

// Controles para agregar al carrito. Cada tarjeta/modal tiene su propia instancia
// independiente (no comparten estado entre si), identificada por data-product.
// Los templos vienen con el Combo preseleccionado (misma opcion que ya se resalta en
// la tabla de precios de arriba) para que el boton de agregar quede listo de inmediato;
// el cliente puede cambiar a Templo o Pandora Box en cualquier momento antes de agregar.
const DEFAULT_TEMPLE_VARIANT = "combo";

// Máscaras y cascos: tamaño adulto (por defecto) o niño (2026-10-18). Niño cuesta
// 10 % menos que adulto, redondeado al sol (misma regla que cart.js).
const SIZE_OPTIONS = { adulto: "Adulto · 1:1", nino: "Niño" };
const DEFAULT_SIZE = "adulto";
// Pandora Box solas (2026-10-18): una publicacion con el set completo (por defecto) o
// uno o varios signos sueltos; cada signo entra al carrito como su propia linea.
const ZODIAC_SIGN_LABELS = { aries: "Aries", tauro: "Tauro", geminis: "Géminis", cancer: "Cáncer", leo: "Leo", virgo: "Virgo", libra: "Libra", escorpio: "Escorpio", sagitario: "Sagitario", capricornio: "Capricornio", acuario: "Acuario", piscis: "Piscis" };
const sizePrice = (product, key) =>
  key === "nino" ? Math.round(Number(product.regularPrice || 0) * 0.9) : Number(product.regularPrice || 0);

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
    : product.signPicker
    ? `
      <div class="temple-price-card sign-mode" role="group" aria-label="Elige set completo o signos para ${product.name}">
        <button type="button" class="temple-price-option is-selected" data-pick-mode="set" aria-pressed="true">
          <span>Set completo · 12 signos</span>
          <strong>${formatPrice(product.signPicker.setPrice)}</strong>
        </button>
        <button type="button" class="temple-price-option" data-pick-mode="signos" aria-pressed="false">
          <span>Elegir signos</span>
          <strong>${formatPrice(product.signPicker.unitPrice)} c/u</strong>
        </button>
      </div>
      <div class="sign-chips" data-sign-chips hidden role="group" aria-label="Signos">
        ${Object.entries(ZODIAC_SIGN_LABELS)
          .map(([key, label]) => `<button type="button" class="sign-chip" data-sign="${key}" aria-pressed="false">${label}</button>`)
          .join("")}
      </div>
      <p class="sign-hint" data-sign-hint hidden></p>
    `
    : product.sizeOptions
    ? `
      <div class="temple-price-card size-picker" role="group" aria-label="Elige el tamaño de ${product.name}">
        ${Object.keys(SIZE_OPTIONS)
          .map((key) => {
            const selected = key === DEFAULT_SIZE;
            return `
              <button type="button" class="temple-price-option${selected ? " is-selected" : ""}" data-variant-option="${key}" aria-pressed="${selected}">
                <span>${SIZE_OPTIONS[key]}</span>
                <strong>${formatPrice(sizePrice(product, key))}</strong>
              </button>
            `;
          })
          .join("")}
      </div>
    `
    : "";

  const initialVariant = product.templePricing
    ? DEFAULT_TEMPLE_VARIANT
    : product.signPicker ? "set12" : product.sizeOptions ? DEFAULT_SIZE : "";

  // Resumen de lo que se va a agregar (opcion + precio). En el celular la barra
  // de compra queda fija abajo y tapa las opciones, asi que el boton lo repite
  // (se muestra con CSS en la ficha movil y se actualiza al cambiar de opcion).
  const initialPriceLabel = product.templePricing
    ? `${TEMPLE_BOX_LABELS[DEFAULT_TEMPLE_VARIANT]} · ${formatPrice(product.templePricing[DEFAULT_TEMPLE_VARIANT])}`
    : product.signPicker
    ? `Set completo · ${formatPrice(product.signPicker.setPrice)}`
    : product.sizeOptions
    ? `${SIZE_OPTIONS[DEFAULT_SIZE]} · ${formatPrice(sizePrice(product, DEFAULT_SIZE))}`
    : formatPrice(product.regularPrice);

  return `
    <div class="add-to-cart" data-product="${product.id}" data-variant="${initialVariant}"${product.signPicker
      ? ` data-unit-price="${product.signPicker.unitPrice}" data-set-price="${product.signPicker.setPrice}"`
      : ""}>
      ${variantPicker}
      <div class="add-to-cart-row">
        <div class="qty-stepper" role="group" aria-label="Cantidad">
          <button type="button" class="qty-btn" data-qty-decrease aria-label="Quitar una unidad">−</button>
          <span class="qty-value" data-qty-value>1</span>
          <button type="button" class="qty-btn" data-qty-increase aria-label="Agregar una unidad">+</button>
        </div>
        <button type="button" class="button primary add-to-cart-btn" data-add-to-cart data-price-label="${initialPriceLabel}">
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
  // Con tamaños o signos, cada opción del selector ya muestra su precio.
  if (product.sizeOptions || product.signPicker) return "";

  return `
    <div class="simple-price">
      <strong>${formatPrice(product.regularPrice)}</strong>
    </div>
  `;
};

// Tarjeta de la grilla (pedido de Adrian, 2026-09-29): solo foto, nombre y
// precio -- para que entren mas productos de un vistazo. Descripcion,
// categoria, selector de opciones (Templo/Pandora/Combo), cantidad y
// "Agregar al carrito" quedan para la ficha del producto (ver openProduct()
// y modalPricing mas abajo, que ya reusan priceMarkup()/addToCartMarkup()).
// Toda la tarjeta abre la ficha al tocarla, no solo la foto o el nombre.
const gridPriceMarkup = (product) => {
  if (product.templePricing) {
    // "Desde" muestra el templo solo (la pieza principal), no la opcion mas
    // barata de las 3 (Pandora Box sola es un accesorio, no el producto).
    return `
      <div class="simple-price">
        <strong>Desde ${formatPrice(product.templePricing.temple)}</strong>
      </div>
    `;
  }
  if (product.signPicker) {
    return `
      <div class="simple-price">
        <strong>Desde ${formatPrice(product.signPicker.unitPrice)}</strong>
      </div>
    `;
  }
  if (product.sizeOptions) {
    // En la grilla: el precio de adulto (la opción por defecto).
    return `
      <div class="simple-price">
        <strong>${formatPrice(product.regularPrice)}</strong>
      </div>
    `;
  }
  return priceMarkup(product);
};

// Colecciones (mejora de diseño, Tanda 2, 2026-10-14): en la vista "Todos" sin
// búsqueda, los 12 templos y los 12 altares del Zodiaco se muestran como UNA
// tarjeta cada uno (antes eran 24 tarjetas casi iguales). Los productos siguen
// siendo individuales en products.json, el carrito y las páginas de producto:
// solo cambia cómo se agrupan en la grilla. Al tocar la tarjeta se ve la colección
// completa (cada pieza por separado); con búsqueda o categoría activa tampoco se agrupa.
const ZODIAC_SIGNS = [
  ["aries", "Aries"], ["tauro", "Tauro"], ["geminis", "Géminis"], ["cancer", "Cáncer"],
  ["leo", "Leo"], ["virgo", "Virgo"], ["libra", "Libra"], ["escorpio", "Escorpio"],
  ["sagitario", "Sagitario"], ["capricornio", "Capricornio"], ["acuario", "Acuario"], ["piscis", "Piscis"],
];
const COLLECTIONS = [
  { key: "templos-zodiaco", title: "Templos del Zodiaco", kicker: "Saint Seiya", idPrefix: "templo-" },
  { key: "altares-zodiaco", title: "Altares del Zodiaco", kicker: "Saint Seiya", idPrefix: "altar-exhibidor-" },
].map((collection) => ({
  ...collection,
  ids: ZODIAC_SIGNS.map(([sign]) => `${collection.idPrefix}${sign}`),
}));
let activeCollection = null;

const collectionItems = (collection) =>
  collection.ids.map((id) => products.find((product) => product.id === id)).filter(Boolean);

const currentPrice = (product) =>
  product.templePricing
    ? Number(product.templePricing.temple)
    : Number(product.regularPrice);

const collectionCard = (collection, items) => {
  const first = items[0];
  const lowest = Math.min(...items.map(currentPrice));
  const labels = Object.fromEntries(ZODIAC_SIGNS.map(([sign, label]) => [`${collection.idPrefix}${sign}`, label]));
  const signChips = items
    .slice(0, 3)
    .map((item) => `<button type="button" data-open="${item.id}">${labels[item.id]}</button>`)
    .join("");
  const more = items.length > 3
    ? `<button type="button" data-collection="${collection.key}" aria-label="Ver los ${items.length} signos">+${items.length - 3}</button>`
    : "";
  return `
  <article class="product-card collection-card" data-collection="${collection.key}">
    <button class="card-media" type="button" data-collection="${collection.key}" aria-label="Ver los ${items.length} signos: ${collection.title}">
      <span class="collection-count">${items.length} signos</span>
      <img src="${webpSrc(first.image)}" alt="" loading="lazy" decoding="async">
    </button>
    <div class="card-body">
      <p class="collection-kicker">${collection.kicker}</p>
      <h3>${collection.title}</h3>
      <div class="simple-price"><strong>Desde ${formatPrice(lowest)}</strong></div>
      <div class="collection-signs">${signChips}${more}</div>
    </div>
  </article>
`;
};

const productCard = (product) => `
  <article class="product-card" data-open="${product.id}">
    <button class="card-media" type="button" data-open="${product.id}" aria-label="Ver ${product.name}">
      ${productImage(product)}
    </button>
    <div class="card-body">
      <h3>${product.name}</h3>
      ${gridPriceMarkup(product)}
    </div>
  </article>
`;

// Sección de temporada: si existe la categoría "🎃 Halloween" va primero en la
// franja (y resaltada en naranja vía CSS). Para archivarla al terminar la
// temporada, cambia la categoría de esos productos en el panel.
const SEASON_LABEL = "🎃 Halloween";

// El filtro Halloween del catalogo principal es una coleccion transversal:
// incluye tambien productos cuya categoria principal es Marvel, Saint Seiya o
// Series y Peliculas. El orden prioriza disfraces/cosplay, luego cascos y
// accesorios, y deja decoracion/figuras al final. Mantener sincronizado con
// HALLOWEEN_CAMPAIGN_PRODUCT_IDS en scripts/build-ai-catalog.mjs.
const HALLOWEEN_CAMPAIGN_PRODUCT_IDS = [
  "visor-de-cyclops",
  "mascara-red-hood",
  "mascara-dr-doom",
  "casco-de-batman",
  "casco-de-stormtrooper",
  "casco-del-mandaloriano",
  "tiara-de-ikki-de-fenix-saint-seiya",
  "mascarada-del-diablo",
  "cuernos-de-fauno",
  "corona-de-elfo",
  "casco-gladiador-maximo",
  "mascara-calabaza-calavera",
  "evil-mask",
  "mascara-hellboy-articulada",
  "mascara-baphomet",
  "mascara-krampus",
  "mascara-de-batwoman",
  "mascara-el-juego-del-calamar",
  "casco-de-wolverine-con-garras",
  "casco-de-agamenon-la-odisea",
  "casco-de-pegaso-saint-seiya",
  "tiara-de-pegaso-saint-seiya",
  "candelabro-calavera",
  "mario-billy-saw",
  "zkull-urban",
];
const HALLOWEEN_CAMPAIGN_ORDER = new Map(
  HALLOWEEN_CAMPAIGN_PRODUCT_IDS.map((id, index) => [id, index]),
);

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
  // "Todos" queda marcado de verdad cuando no hay filtro (antes ninguna pastilla lo
  // indicaba). "Te ayudo a elegir" (solo celular, ver CSS) abre el asistente: ya
  // no flota sobre las fotos en las páginas que tienen portada.
  const assistantChip = `<button class="assistant-chip" type="button" id="filterAssistant">Te ayudo a elegir</button>`;
  const allChip = `<button class="${activeFilter === "Todos" && !activeCollection ? "active" : ""}" type="button" data-filter="Todos">Todos</button>`;
  filterRow.innerHTML = assistantChip + allChip + catalogCategories()
    .map((category) => `<button class="${category === activeFilter ? "active" : ""}" type="button" data-filter="${category}">${category}</button>`)
    .join("");
};

const quickCategoriesPanel = document.querySelector("#quickCategoriesPanel");
const quickCategoriesList = document.querySelector("#quickCategoriesList");

const renderQuickCategories = () => {
  quickCategoriesList.innerHTML = catalogCategories()
    .map((category) => `<button class="${category === activeFilter ? "active" : ""}" type="button" data-filter="${category}">${category}</button>`)
    .join("");
};

const matchesProduct = (product) => {
  const query = normalize(searchInput.value);
  const haystack = normalize([product.name, product.category, product.description, product.height, ...(product.tags || [])].join(" "));
  const matchesSearch = !query || haystack.includes(query);
  const matchesFilter = activeFilter === "Todos" ||
    (activeFilter === SEASON_LABEL
      ? HALLOWEEN_CAMPAIGN_ORDER.has(product.id)
      : product.category === activeFilter || (product.extraCategories || []).includes(activeFilter));
  const matchesCollection = !activeCollection || activeCollection.ids.includes(product.id);
  return matchesSearch && matchesFilter && matchesCollection;
};

const renderProducts = () => {
  // La búsqueda es global: si se escribe algo, se sale de la colección abierta.
  if (searchInput.value.trim()) activeCollection = null;
  const visible = products.filter(matchesProduct);
  if (activeFilter === SEASON_LABEL) {
    visible.sort(
      (a, b) => HALLOWEEN_CAMPAIGN_ORDER.get(a.id) - HALLOWEEN_CAMPAIGN_ORDER.get(b.id),
    );
  }

  const grouped = activeFilter === "Todos" && !activeCollection && !searchInput.value.trim();
  if (grouped) {
    const shown = new Set();
    productGrid.innerHTML = visible
      .map((product) => {
        const collection = COLLECTIONS.find((candidate) => candidate.ids.includes(product.id));
        const items = collection ? collectionItems(collection) : [];
        if (!collection || items.length < 3) return productCard(product);
        if (shown.has(collection.key)) return "";
        shown.add(collection.key);
        return collectionCard(collection, items);
      })
      .join("");
  } else {
    productGrid.innerHTML = visible.map(productCard).join("");
  }

  resultCount.textContent = activeCollection
    ? `${activeCollection.title} · ${visible.length} productos`
    : `${visible.length} producto${visible.length === 1 ? "" : "s"} visible${visible.length === 1 ? "" : "s"}`;
  clearFilters.textContent = activeCollection ? "← Ver todo el catálogo" : "Limpiar filtros";
  emptyState.hidden = visible.length > 0;
};

// Lleva al inicio de los resultados (útil en el celular, donde la colección
// o categoría elegida arriba queda lejos de la grilla).
const scrollToResults = () => {
  document.querySelector(".result-meta")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const setGlobalWhatsapp = () => {
  const setHref = (selector, message) => {
    const node = document.querySelector(selector);
    if (node) node.href = whatsappUrl(message);
  };
  setHref("#offersWhatsapp", "Hola BoomArt, quiero consultar por las colecciones de Saint Seiya.");
  setHref("#footerWhatsapp", config.defaultMessage);
};

// Galería de la ficha: fotos + (opcional) un video corto del producto, que va
// segundo para que la foto principal siga siendo la portada. El video se pinta
// solo cuando se elige (no se descarga antes), sin sonido y en bucle (2026-10-15).
const galleryItems = (product) => {
  const photos = (product.gallery.length ? product.gallery : [product.image].filter(Boolean))
    .map((src) => ({ type: "image", src }));
  if (product.video && product.video.src) {
    photos.splice(Math.min(1, photos.length), 0, { type: "video", src: product.video.src, poster: product.video.poster || "" });
  }
  return photos;
};

const renderModalImage = () => {
  const gallery = galleryItems(activeProduct);
  const current = gallery[activeImageIndex];
  modalImageWrap.innerHTML = !current
    ? placeholder(activeProduct)
    : current.type === "video"
      ? `<video class="modal-video" src="${current.src}"${current.poster ? ` poster="${current.poster}"` : ""} autoplay muted loop playsinline preload="auto" aria-label="Video de ${activeProduct.name}"></video>`
      : `<img src="${webpSrc(current.src)}" alt="${activeProduct.name} imagen ${activeImageIndex + 1}" decoding="async">`;

  thumbRow.innerHTML = gallery
    .map((item, index) => item.type === "video"
      ? `<button class="thumb-video${index === activeImageIndex ? " active" : ""}" type="button" data-thumb="${index}" aria-label="Ver video de ${activeProduct.name}"><img src="${item.poster || webpSrc(activeProduct.image)}" alt="" loading="lazy" decoding="async"><span aria-hidden="true">▶</span></button>`
      : `<button class="${index === activeImageIndex ? "active" : ""}" type="button" data-thumb="${index}" aria-label="Ver foto ${index + 1} de ${gallery.length} de ${activeProduct.name}"><img src="${webpSrc(item.src)}" alt="" loading="lazy" decoding="async"></button>`)
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
  let modalNotice = document.querySelector("#modalNotice");
  if (!modalNotice) {
    modalNotice = document.createElement("p");
    modalNotice.id = "modalNotice";
    modalNotice.className = "product-notice";
    const details = document.querySelector("#modalDetails");
    if (details) details.insertAdjacentElement("afterend", modalNotice);
  }
  const notice = productNotice(activeProduct);
  modalNotice.hidden = !notice;
  modalNotice.textContent = notice ? `⚠️ ${notice}` : "";
  modalDetails.textContent = [
    activeProduct.height ? `Tamaño: ${activeProduct.height}` : "",
    activeProduct.material ? `Material: ${activeProduct.material}` : "",
  ].filter(Boolean).join(" · ");
  modalPricing.innerHTML = priceMarkup(activeProduct) + addToCartMarkup(activeProduct);
  if (shareProductWa) {
    shareProductWa.href = whatsappUrl(inquiryMessage(activeProduct));
    shareProductWa.dataset.product = productId;
  }
  if (!fromHistory) trackEvt("ver_producto", { p: productId, o: "tienda" });
  if (shareFeedback) shareFeedback.hidden = true;
  renderModalImage();
  if (!modal.open) modal.showModal();
  setCanonical(productPageUrl(productId));

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
  setCanonical(`${SITE_ORIGIN}/`);
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

// Pandora Box solas: al marcar un signo se muestra la foto de su caja; al volver al
// set completo, la foto de las 12 (2026-10-18).
document.addEventListener("boomart:show-sign", (event) => {
  if (!activeProduct || !activeProduct.signPicker) return;
  const sign = event.detail && event.detail.sign;
  const gallery = galleryItems(activeProduct);
  const index = sign === "set" ? 0 : gallery.findIndex((item) => item.type === "image" && item.src.endsWith(`-${sign}.jpg`));
  if (index < 0 || index === activeImageIndex) return;
  activeImageIndex = index;
  renderModalImage();
});

const changeImage = (direction) => {
  const gallery = galleryItems(activeProduct);
  if (gallery.length < 2) return;
  activeImageIndex = (activeImageIndex + direction + gallery.length) % gallery.length;
  renderModalImage();
};

document.addEventListener("click", (event) => {
  const openButton = event.target.closest("[data-open]");
  const filterButton = event.target.closest("[data-filter]");
  const thumbButton = event.target.closest("[data-thumb]");
  // Una pastilla de signo dentro de una tarjeta de colección abre esa pieza (data-open
  // gana); el resto de la tarjeta abre la colección completa.
  const collectionButton = openButton ? null : event.target.closest("[data-collection]");

  if (openButton) openProduct(openButton.dataset.open);
  if (collectionButton) {
    const collection = COLLECTIONS.find((candidate) => candidate.key === collectionButton.dataset.collection);
    if (collection) {
      activeCollection = collection;
      activeFilter = "Todos";
      searchInput.value = "";
      quickSearchInput.value = "";
      trackEvt("filtrar", { d: { categoria: collection.title } });
      renderFilters();
      renderQuickCategories();
      renderProducts();
      scrollToResults();
    }
  }
  if (filterButton) {
    const fromQuickPanel = Boolean(filterButton.closest("#quickCategoriesPanel"));
    // Las colecciones de la portada (data-scroll) eligen su categoría sin alternar.
    const fromTile = filterButton.hasAttribute("data-scroll");
    const clicked = filterButton.dataset.filter;
    activeCollection = null;
    // Tocar la categoría que ya está activa la desactiva (vuelve a "Todos").
    activeFilter = !fromTile && clicked === activeFilter ? "Todos" : clicked;
    if (activeFilter !== "Todos") trackEvt("filtrar", { d: { categoria: activeFilter } });
    if (fromTile) {
      searchInput.value = "";
      quickSearchInput.value = "";
    }
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
    } else if (fromTile) {
      scrollToResults();
    }
  }
  if (thumbButton) {
    activeImageIndex = Number(thumbButton.dataset.thumb);
    renderModalImage();
  }
});

searchInput.addEventListener("input", renderProducts);
let searchTrackTimer = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTrackTimer);
  searchTrackTimer = setTimeout(() => {
    const q = searchInput.value.trim();
    if (q.length >= 2) trackEvt("buscar", { d: { q: q.slice(0, 40) } });
  }, 900);
});
clearFilters.addEventListener("click", () => {
  activeFilter = "Todos";
  activeCollection = null;
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
      shareFeedback.textContent = "No se pudo copiar el enlace";
      shareFeedback.hidden = false;
      setTimeout(() => { shareFeedback.hidden = true; }, 3200);
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
  if (result === "failed") {
    // Sin menu de compartir ni permiso de copiar: abrimos la ficha, que tiene
    // su propio boton de compartir y el de consultar por WhatsApp.
    openProduct(product.id);
    return;
  }
  if (result === "copied") {
    const textNode = [...shareBtn.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (textNode) {
      const prevText = textNode.textContent;
      shareBtn.classList.add("is-copied");
      textNode.textContent = " Enlace copiado ✓";
      setTimeout(() => {
        shareBtn.classList.remove("is-copied");
        textNode.textContent = prevText;
      }, 2400);
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

// Banner y emergente "Registrate y gana un cupon de descuento sorpresa"
// (pedido de Adrian, 2026-09-29): marca que la persona vino por esta via
// (account.js guardaba ahi una exigencia de DNI que luego se retracto; la
// marca se deja igual por si se reactiva algo similar mas adelante) y abre
// "Mi cuenta" reusando su boton de siempre -- no duplica logica de apertura.
function openCouponRegistration() {
  try {
    window.localStorage.setItem("boomart_coupon_intent", "1");
  } catch (err) {
    // almacenamiento no disponible -- el registro sigue funcionando igual.
  }
  // setTimeout (no una llamada directa): un dialog.showModal() disparado
  // por un .click() anidado DENTRO del mismo evento de clic real a veces
  // no llega a abrirse (visto en pruebas) -- diferirlo al siguiente tick
  // lo hace confiable sin cambiar accountToggle ni account.js.
  setTimeout(() => {
    const accountToggle = document.querySelector("#accountToggle");
    if (accountToggle) accountToggle.click();
  }, 0);
}

const couponBanner = document.querySelector("#couponBanner");
if (couponBanner) {
  couponBanner.addEventListener("click", openCouponRegistration);
}

// Emergente del cupon: siempre al entrar por un enlace corto de campana
// (?categoria=<slug>) y, ademas, una vez por visitante en los accesos
// principales. La pieza aparece, crece y se recoge en el boton permanente de
// registro; la trayectoria usa la posicion real del boton en cada pantalla.
const COUPON_POPUP_SEEN_KEY = "boomart_coupon_popup_seen";
function hasSeenCouponPopup() {
  try {
    return window.localStorage.getItem(COUPON_POPUP_SEEN_KEY) === "1";
  } catch (err) {
    return false;
  }
}
function markCouponPopupSeen() {
  try {
    window.localStorage.setItem(COUPON_POPUP_SEEN_KEY, "1");
  } catch (err) {
    // almacenamiento no disponible -- en ese navegador se mostrara siempre,
    // sin romper nada (el emergente sigue siendo solo informativo).
  }
}
const couponPopup = document.querySelector("#couponPopup");
const couponPopupBtn = document.querySelector("#couponPopupBtn");
const couponReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Tiempos del emergente (pedido de Adrián, 2026-10-15): antes se leía apenas
// 0,3 s y desaparecía; ahora se queda lo suficiente para leerlo, viaja de forma
// visible hasta el botón de registro y ese botón queda resaltado unos segundos,
// para que se entienda dónde se reclama el cupón.
const COUPON_READ_MS = 2600;
const COUPON_FLY_MS = 950;
const COUPON_HIGHLIGHT_MS = 2600;

function pulseCouponTarget() {
  if (!couponBanner) return;
  clearTimeout(Number(couponBanner.dataset.pulseTimer));
  couponBanner.classList.remove("coupon-received");
  // Reinicia el resaltado incluso si el enlace de campaña vuelve a mostrar el cupón.
  void couponBanner.offsetWidth;
  couponBanner.classList.add("coupon-received");
  const pulseTimer = setTimeout(() => couponBanner.classList.remove("coupon-received"), COUPON_HIGHLIGHT_MS);
  couponBanner.dataset.pulseTimer = String(pulseTimer);
}

function scheduleCouponFly(delay) {
  if (!couponPopup) return;
  clearTimeout(Number(couponPopup.dataset.flyTimer));
  const flyTimer = setTimeout(() => flyCouponPopup(), delay);
  couponPopup.dataset.flyTimer = String(flyTimer);
}

function showCouponPopup() {
  if (!couponPopup) return;
  clearTimeout(Number(couponPopup.dataset.flyTimer));
  clearTimeout(Number(couponPopup.dataset.hideTimer));
  couponPopup.classList.remove("is-visible", "is-flying", "is-settled", "is-held");
  couponPopup.style.setProperty("--coupon-read-ms", `${COUPON_READ_MS}ms`);
  couponPopup.hidden = false;
  couponPopup.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => requestAnimationFrame(() => couponPopup.classList.add("is-visible")));

  // Entrada (420 ms) + lectura con una línea roja que se completa + viaje
  // visible al botón: unos 3,5 s en total, sin bloquear la página (el fondo
  // no captura clics).
  scheduleCouponFly(COUPON_READ_MS);
}

function flyCouponPopup() {
  if (!couponPopup || couponPopup.hidden) return;
  clearTimeout(Number(couponPopup.dataset.flyTimer));

  if (couponReducedMotion.matches) {
    couponPopup.hidden = true;
    couponPopup.setAttribute("aria-hidden", "true");
    couponPopup.classList.remove("is-visible", "is-flying", "is-settled", "is-held");
    pulseCouponTarget();
    return;
  }

  couponPopup.classList.add("is-settled");
  void couponPopupBtn?.offsetWidth;

  // Destino: la etiqueta "Reclama 10% de bienvenida" dentro del botón
  // permanente; la tarjeta se encoge hasta su tamaño para que se lea como
  // "el cupón se guardó aquí".
  const target = couponBanner?.querySelector(".coupon-ticket") || couponBanner;
  const cardRect = couponPopupBtn?.getBoundingClientRect();
  const targetRect = target?.getBoundingClientRect();
  if (cardRect && targetRect && cardRect.width) {
    // Si el botón quedó fuera de la pantalla (página ya desplazada), la tarjeta
    // sube hacia el borde superior, que es donde está.
    const targetY = targetRect.bottom > 0 ? targetRect.top + (targetRect.height / 2) : 0;
    const flyX = targetRect.left + (targetRect.width / 2) - (cardRect.left + (cardRect.width / 2));
    const flyY = targetY - (cardRect.top + (cardRect.height / 2));
    const scale = Math.min(0.6, Math.max(0.18, targetRect.width / cardRect.width));
    couponPopup.style.setProperty("--coupon-fly-x", `${Math.round(flyX)}px`);
    couponPopup.style.setProperty("--coupon-fly-y", `${Math.round(flyY)}px`);
    couponPopup.style.setProperty("--coupon-fly-scale", scale.toFixed(3));
  }

  couponPopup.classList.add("is-flying");
  const hideTimer = setTimeout(() => {
    couponPopup.hidden = true;
    couponPopup.setAttribute("aria-hidden", "true");
    couponPopup.classList.remove("is-visible", "is-flying", "is-settled", "is-held");
    pulseCouponTarget();
  }, COUPON_FLY_MS + 30);
  couponPopup.dataset.hideTimer = String(hideTimer);
}

if (couponPopupBtn) {
  couponPopupBtn.addEventListener("click", () => {
    clearTimeout(Number(couponPopup.dataset.flyTimer));
    flyCouponPopup();
    setTimeout(openCouponRegistration, couponReducedMotion.matches ? 0 : 260);
  });
  // Si la persona está leyendo (cursor encima o foco de teclado), la tarjeta
  // espera; al salir, se va hacia el botón poco después.
  const holdCoupon = () => {
    if (couponPopup.classList.contains("is-flying")) return;
    clearTimeout(Number(couponPopup.dataset.flyTimer));
    couponPopup.classList.add("is-held");
  };
  const releaseCoupon = () => {
    if (couponPopup.hidden || couponPopup.classList.contains("is-flying")) return;
    couponPopup.classList.remove("is-held");
    scheduleCouponFly(900);
  };
  couponPopupBtn.addEventListener("mouseenter", holdCoupon);
  couponPopupBtn.addEventListener("focus", holdCoupon);
  couponPopupBtn.addEventListener("mouseleave", releaseCoupon);
  couponPopupBtn.addEventListener("blur", releaseCoupon);
}

document.addEventListener("boomart:products-ready", () => {
  products = window.BOOMART_PRODUCTS || [];

  // Si una categoría de las colecciones de la portada ya no existe en el catálogo,
  // su tarjeta se oculta (en vez de llevar a una lista vacía).
  document.querySelectorAll(".collection-tile[data-filter]").forEach((tile) => {
    tile.hidden = !catalogCategories().includes(tile.dataset.filter);
  });

  // Enlace corto de campana (?categoria=saint-seiya): preselecciona esa
  // categoria antes de pintar, para que el catalogo cargue ya filtrado.
  // Slug desconocido o ausente = "Todos", sin romper nada.
  // /Halloween/ es la misma portada con la campaña fija (window.BOOMART_FORCE_CATEGORY,
  // lo pone scripts/build-ai-catalog.mjs al generar esa página).
  const categoriaParam = new URL(window.location.href).searchParams.get(CATEGORY_PARAM) ||
    window.BOOMART_FORCE_CATEGORY || "";
  let matchedCategoryLink = false;
  if (categoriaParam) {
    const match = catalogCategories().find((cat) => slugifyCategory(cat) === slugifyCategory(categoriaParam));
    if (match) {
      activeFilter = match;
      matchedCategoryLink = true;
    }
  }

  renderFilters();
  renderQuickCategories();
  renderProducts();

  // Si se entro con un enlace directo a un producto, abrir esa ficha. El
  // emergente del cupon no aplica aqui: quien comparte/abre un producto
  // puntual no es "un acceso principal" y ya tiene su propia ficha abierta.
  const id = new URL(window.location.href).searchParams.get(PRODUCT_PARAM);
  if (id && products.find((p) => p.id === id)) {
    openProduct(id, true);
  } else if (matchedCategoryLink) {
    // Enlace de campana: siempre se muestra, cada vez que se use el enlace.
    showCouponPopup();
  } else if (!hasSeenCouponPopup()) {
    // Acceso principal normal (boomart.pe/, buscadores, bio de redes, etc.):
    // una sola vez por visitante, para no repetirlo en cada visita.
    showCouponPopup();
    markCouponPopupSeen();
  }
});

// Portada (mejora de diseño, Tanda 2, 2026-10-14).
// 1) Las cifras de reseñas de la portada se copian de la sección #opiniones (que
//    ya se mantiene al día con data/reviews.json), así nunca quedan desactualizadas.
const syncReviewHighlights = () => {
  const score = document.querySelector("#reviewsSummary .reviews-score")?.textContent.trim();
  const count = document.querySelector("#reviewsSummary .reviews-count")?.textContent.trim();
  if (score) document.querySelectorAll(".js-review-score").forEach((node) => { node.textContent = score; });
  if (count) document.querySelectorAll(".js-review-count").forEach((node) => { node.textContent = count; });
};
syncReviewHighlights();
const reviewsSummaryNode = document.querySelector("#reviewsSummary");
if (reviewsSummaryNode && "MutationObserver" in window) {
  new MutationObserver(syncReviewHighlights).observe(reviewsSummaryNode, { childList: true, subtree: true, characterData: true });
}

// 2) Carrete editorial de la portada. Las fotos son productos reales del
// catálogo: cambian con un fundido breve, se pueden elegir manualmente y dejan
// de animarse cuando el sistema pide reducir movimiento o la pestaña no se ve.
const heroReel = document.querySelector("#heroReel");
if (heroReel) {
  const slides = [...heroReel.querySelectorAll(".hero-reel-slide")];
  const dots = [...heroReel.querySelectorAll(".hero-reel-dot")];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let activeSlide = 0;
  let reelTimer = null;

  // Desde la 3.ª foto, las imágenes llevan data-src: se cargan cuando su foto
  // está por mostrarse (la actual y la siguiente), no todas al abrir la página.
  const loadHeroSlide = (index) => {
    const slide = slides[(index + slides.length) % slides.length];
    slide?.querySelectorAll("img[data-src]").forEach((img) => {
      img.src = img.dataset.src;
      img.removeAttribute("data-src");
    });
  };

  // Carrusel (pedido de Adrián, 2026-10-15): las fotos corren de derecha a
  // izquierda y a los lados asoma un pedazo del producto anterior y del
  // siguiente. Cada foto se ubica por su distancia circular a la activa
  // (--reel-d: -1 izquierda, 0 centro, 1 derecha; ±2 fuera de vista). Las que
  // dan la vuelta por fuera de la vista saltan sin animación.
  const n = slides.length;
  const offsetOf = (index, active) => {
    let d = (index - active) % n;
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    return d;
  };
  const placeSlides = (active, previous) => {
    slides.forEach((slide, index) => {
      const d = offsetOf(index, active);
      const was = previous == null ? d : offsetOf(index, previous);
      const clamped = Math.max(-2, Math.min(2, d));
      // Saltar sin animación si cruza por detrás (de un extremo al otro).
      slide.classList.toggle("is-jumping", Math.abs(was) >= 2 && Math.abs(d) >= 2 || Math.sign(was) * Math.sign(d) < 0 && Math.abs(was - d) > 2);
      slide.style.setProperty("--reel-d", String(clamped));
      slide.classList.toggle("is-active", d === 0);
      slide.classList.toggle("is-side", Math.abs(d) === 1);
      slide.setAttribute("aria-hidden", String(d !== 0));
      slide.tabIndex = d === 0 ? 0 : -1;
    });
  };

  const showHeroSlide = (nextIndex, manual = false) => {
    const previous = activeSlide;
    activeSlide = (nextIndex + slides.length) % slides.length;
    // La activa, sus vecinas visibles y la que entra después.
    [-1, 0, 1, 2].forEach((k) => loadHeroSlide(activeSlide + k));
    placeSlides(activeSlide, previous);
    dots.forEach((dot, index) => {
      const active = index === activeSlide;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-pressed", String(active));
    });
    if (manual) restartHeroReel();
  };

  const stopHeroReel = () => {
    if (reelTimer) window.clearInterval(reelTimer);
    reelTimer = null;
  };

  const startHeroReel = () => {
    stopHeroReel();
    if (reduceMotion.matches || document.hidden || slides.length < 2) return;
    reelTimer = window.setInterval(() => showHeroSlide(activeSlide + 1), 5600);
  };

  function restartHeroReel() {
    stopHeroReel();
    startHeroReel();
  }

  dots.forEach((dot, index) => dot.addEventListener("click", () => showHeroSlide(index, true)));
  heroReel.addEventListener("mouseenter", stopHeroReel);
  heroReel.addEventListener("mouseleave", startHeroReel);
  heroReel.addEventListener("focusin", stopHeroReel);
  heroReel.addEventListener("focusout", (event) => {
    if (!heroReel.contains(event.relatedTarget)) startHeroReel();
  });
  heroReel.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    showHeroSlide(activeSlide + (event.key === "ArrowRight" ? 1 : -1), true);
    dots[activeSlide]?.focus();
  });
  // Deslizar con el dedo en el celular.
  let touchX = null;
  heroReel.addEventListener("touchstart", (event) => {
    touchX = event.touches[0].clientX;
  }, { passive: true });
  heroReel.addEventListener("touchend", (event) => {
    if (touchX == null) return;
    const dx = event.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 40) showHeroSlide(activeSlide + (dx < 0 ? 1 : -1), true);
  }, { passive: true });
  // Tocar un producto de los costados lo trae al centro (en vez de abrirlo).
  heroReel.addEventListener("click", (event) => {
    const side = event.target.closest(".hero-reel-slide.is-side");
    if (!side) return;
    event.preventDefault();
    showHeroSlide(slides.indexOf(side), true);
  });

  heroReel.classList.add("is-carousel");
  placeSlides(activeSlide, null);
  [-1, 1, 2].forEach((k) => loadHeroSlide(activeSlide + k));
  document.addEventListener("visibilitychange", startHeroReel);
  reduceMotion.addEventListener?.("change", startHeroReel);
  startHeroReel();
}

// 2b) Brillo de las colecciones destacadas (2026-10-15): una sola pasada, en
// cascada, cuando la sección aparece en pantalla. La animación es CSS
// (.is-shining); aquí solo se decide cuándo, sin escuchar el scroll.
const shineTiles = [...document.querySelectorAll(".collection-tile")]
  .filter((tile) => ["Saint Seiya", "Halloween", "Harry Potter"].some((name) => (tile.dataset.filter || "").includes(name)));
if (shineTiles.length && "IntersectionObserver" in window) {
  const shineObserver = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    shineObserver.disconnect();
    shineTiles.forEach((tile, index) => {
      tile.style.setProperty("--shine-delay", `${index * 0.18}s`);
      tile.classList.add("is-shining");
      tile.addEventListener("animationend", () => tile.classList.remove("is-shining"), { once: true });
    });
  }, { threshold: 0.45 });
  shineObserver.observe(shineTiles[0]);
}

// 3) «Te ayudo a elegir» en la portada y en la fila de filtros (celular) abre el
//    mismo asistente que el botón flotante (que en el celular se oculta cuando
//    la página tiene portada, para que no tape las fotos).
document.addEventListener("click", (event) => {
  if (!event.target.closest("#heroAssistant, #filterAssistant")) return;
  document.querySelector(".shopping-assistant-toggle")?.click();
});
