/* Vitrina publica de un vendedor (por defecto, Random Figures). Lee SOLO lo publicado, con la clave publica y las reglas de seguridad de la base
 * (RLS + columnas permitidas): nunca ve borradores, el WhatsApp del vendedor ni la cantidad exacta (salvo que el vendedor la muestre).
 * Una sola consulta trae producto + precio vivo + categoria. Sin innerHTML con datos. */
(function () {
  "use strict";

  const cfg = window.VITRINA_CONFIG;
  const sb = window.supabase.createClient(cfg.apiUrl, cfg.publishableKey, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "vitrina" } });
  const PUBLIC_FILES = cfg.apiUrl + "/storage/v1/object/public/vitrina-publico/";
  const PAGE_SIZE = 24;
  const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}$/;
  const SELECT = "product_id, code, title, description, photos, section_id, collection_id, published_at, "
    + "products!inner(price, available, public_qty), sections(name), collections(name)";

  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const requested = (params.get("tienda") || "").toLowerCase();
  const slug = SLUG_RE.test(requested) ? requested : (document.body.dataset.tienda || "random-figures");
  const state = { seller: null, section: null, collection: null, query: "", sort: "new", page: 0, total: 0, loading: false, token: 0 };
  let sectionsList = [];
  let collectionsList = [];

  function h(tag, props, ...kids) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
      else if (value === true) node.setAttribute(key, "");
      else node.setAttribute(key, String(value));
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  const money = (value) => (value === null || value === undefined ? "Precio a consultar" : "S/ " + Number(value).toFixed(2));
  const fileUrl = (path) => PUBLIC_FILES + path.split("/").map(encodeURIComponent).join("/");

  // ------------------------------------------------------------------------------------------ tienda y categorias
  async function loadShop() {
    const { data, error } = await sb.from("sellers").select("id, slug, name, address, hours, about").eq("slug", slug).maybeSingle();
    if (error || !data) {
      $("shop-name").textContent = "Esta tienda no esta disponible";
      $("results-info").textContent = "";
      document.title = "Tienda no disponible · BoomArt";
      return false;
    }
    state.seller = data;
    $("shop-name").textContent = data.name;
    document.title = data.name + " en BoomArt";
    const about = $("shop-about");
    about.hidden = !data.about;
    about.textContent = data.about || "";
    const meta = [data.address, data.hours].filter(Boolean).join(" · ");
    $("shop-meta").hidden = !meta;
    $("shop-meta").textContent = meta;
    $("prelaunch").hidden = Boolean(cfg.pedidosActivos);
    return true;
  }

  async function loadCategories() {
    const [sections, collections] = await Promise.all([
      sb.from("sections").select("id, name").eq("seller_id", state.seller.id).order("name"),
      sb.from("collections").select("id, section_id, name").eq("seller_id", state.seller.id).order("name"),
    ]);
    sectionsList = sections.data || [];
    collectionsList = collections.data || [];
    renderChips();
  }

  function chip(label, pressed, onclick) {
    return h("button", { class: "chip", type: "button", "aria-pressed": pressed ? "true" : "false", text: label, onclick });
  }

  function renderChips() {
    const holder = $("chips-sections");
    holder.replaceChildren(chip("Todo", state.section === null, () => selectSection(null)),
      ...sectionsList.map((s) => chip(s.name, state.section === s.id, () => selectSection(s.id))));
    const subs = collectionsList.filter((c) => c.section_id === state.section);
    const subHolder = $("chips-collections");
    subHolder.hidden = state.section === null || subs.length === 0;
    subHolder.replaceChildren(chip("Todas", state.collection === null, () => selectCollection(null)),
      ...subs.map((c) => chip(c.name, state.collection === c.id, () => selectCollection(c.id))));
  }

  function selectSection(id) { state.section = id; state.collection = null; renderChips(); reload(); }
  function selectCollection(id) { state.collection = id; renderChips(); reload(); }

  // ------------------------------------------------------------------------------------------ productos
  function buildQuery(from) {
    let query = sb.from("catalog").select(SELECT, { count: "exact" }).eq("seller_id", state.seller.id);
    if (state.section) query = query.eq("section_id", state.section);
    if (state.collection) query = query.eq("collection_id", state.collection);
    const term = state.query.replace(/[%*,()\\]/g, " ").trim();
    if (term) query = query.ilike("title", "*" + term + "*");
    if (state.sort === "price_asc") query = query.order("products(price)", { ascending: true });
    else if (state.sort === "price_desc") query = query.order("products(price)", { ascending: false });
    else query = query.order("published_at", { ascending: false });
    return query.order("product_id").range(from, from + PAGE_SIZE - 1);
  }

  function card(row) {
    const first = (row.photos || [])[0];
    const product = row.products || {};
    const soldOut = product.available === false;
    const photo = h("div", { class: "card-photo" },
      first ? h("img", { src: fileUrl(first.thumb), alt: row.title, loading: "lazy", width: 360, height: 360 }) : h("span", { class: "card-stock", text: "Sin foto" }),
      soldOut ? h("span", { class: "tag", text: "Agotado" }) : null);
    const stock = !soldOut && product.public_qty !== null && product.public_qty !== undefined ? h("span", { class: "card-stock", text: product.public_qty === 1 ? "Queda 1" : "Quedan " + product.public_qty }) : null;
    return h("button", { class: "card" + (soldOut ? " agotado" : ""), type: "button", "aria-label": row.title + ", " + money(product.price) + (soldOut ? ", agotado" : ""), onclick: () => openDetail(row) },
      photo, h("div", { class: "card-body" }, h("span", { class: "card-title", text: row.title }), h("span", { class: "card-price", text: money(product.price) }), stock));
  }

  async function loadPage(reset) {
    if (state.loading) return;
    state.loading = true;
    const token = ++state.token;
    const grid = $("grid");
    if (reset) { state.page = 0; grid.replaceChildren(); $("empty").hidden = true; $("results-info").textContent = "Buscando…"; }
    const { data, error, count } = await buildQuery(state.page * PAGE_SIZE);
    if (token !== state.token) { state.loading = false; return; }
    state.loading = false;
    if (error) {
      $("results-info").textContent = "";
      const empty = $("empty");
      empty.hidden = false;
      empty.textContent = "No pudimos cargar los productos. Revisa tu Internet e intenta de nuevo.";
      $("more").hidden = true;
      return;
    }
    state.total = count || 0;
    for (const row of data || []) grid.append(card(row));
    state.page += 1;
    const shown = grid.children.length;
    $("results-info").textContent = state.total ? "Mostrando " + shown + " de " + state.total + " producto" + (state.total === 1 ? "" : "s") : "";
    $("more").hidden = shown >= state.total;
    const empty = $("empty");
    empty.hidden = state.total > 0;
    if (!state.total) empty.textContent = state.query || state.section ? "No encontramos productos con ese filtro." : "Pronto veras aqui los productos de la tienda.";
  }

  function reload() { loadPage(true); }

  // ------------------------------------------------------------------------------------------ detalle
  function openDetail(row, fromHistory) {
    const host = $("overlay-host");
    const previousFocus = document.activeElement;
    const product = row.products || {};
    const photos = row.photos || [];
    let index = 0;
    const main = h("img", { alt: row.title });
    const thumbs = h("div", { class: "gallery-thumbs" });
    const setPhoto = (i) => {
      index = i;
      if (photos[i]) main.src = fileUrl(photos[i].path);
      for (const [n, button] of [...thumbs.children].entries()) button.setAttribute("aria-current", n === i ? "true" : "false");
    };
    photos.forEach((p, i) => thumbs.append(h("button", { type: "button", "aria-label": "Ver foto " + (i + 1), onclick: () => setPhoto(i) }, h("img", { src: fileUrl(p.thumb), alt: "" }))));
    const soldOut = product.available === false;
    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (!fromHistory && location.hash.startsWith("#p=")) history.replaceState(null, "", location.pathname + location.search);
      if (previousFocus && previousFocus.focus) previousFocus.focus();
    };
    const onKey = (event) => { if (event.key === "Escape") close(); };
    const path = [row.sections && row.sections.name, row.collections && row.collections.name].filter(Boolean).join(" › ");
    const info = h("div", { class: "info" },
      h("h2", { text: row.title }),
      h("div", { class: "price", text: money(product.price) }),
      h("div", { class: "avail" + (soldOut ? " no" : ""), text: soldOut ? "Agotado por ahora" : "Disponible" + (product.public_qty ? " · quedan " + product.public_qty : "") }),
      path ? h("div", { class: "path", text: path }) : null,
      row.description ? h("p", { class: "desc", text: row.description }) : null,
      h("div", { class: "cta-note", text: cfg.pedidosActivos ? "" : "Muy pronto podras pedir este producto desde aqui." }),
      h("div", { class: "code", text: "Codigo " + row.code }));
    const dialog = h("div", { class: "detail", role: "dialog", "aria-modal": "true", "aria-label": row.title },
      h("button", { class: "detail-close", type: "button", text: "Cerrar", onclick: close }),
      h("div", { class: "gallery" }, h("div", { class: "gallery-main" }, main), photos.length > 1 ? thumbs : null), info);
    const overlay = h("div", { class: "overlay", onclick: (event) => { if (event.target === overlay) close(); } }, dialog);
    host.append(overlay);
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    setPhoto(0);
    dialog.querySelector(".detail-close").focus();
    if (!fromHistory) history.replaceState(null, "", location.pathname + location.search + "#p=" + encodeURIComponent(row.code));
  }

  async function openFromHash() {
    const match = /^#p=(P[0-9]{6})$/.exec(decodeURIComponent(location.hash));
    if (!match || !state.seller) return;
    const { data } = await sb.from("catalog").select(SELECT).eq("seller_id", state.seller.id).eq("code", match[1]).maybeSingle();
    if (data) openDetail(data, true);
  }

  // ------------------------------------------------------------------------------------------ arranque
  let searchTimer = null;
  $("search").addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = event.target.value.trim(); reload(); }, 350);
  });
  $("sort").addEventListener("change", (event) => { state.sort = event.target.value; reload(); });
  $("more").addEventListener("click", () => loadPage(false));

  (async () => {
    if (!(await loadShop())) return;
    await loadCategories();
    await loadPage(true);
    openFromHash();
  })();
})();
