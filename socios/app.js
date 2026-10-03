/*
 * Portal de socios · BoomArt (Etapa 4).
 * Lee con el JWT del propio local (vistas protegidas por RLS) y escribe SOLO a traves de la funcion `socios-portal`.
 * Todos los numeros (stock, precios BoomArt, totales, ganancia, tiempo para deshacer) los calcula el servidor; aqui solo se muestran.
 * Nunca se arma HTML con datos: todo texto entra con textContent (sin innerHTML) y la politica de contenido no admite codigo en linea.
 */
(function () {
  "use strict";

  const CFG = window.SOCIOS_PORTAL;
  const U = window.SociosUtil;
  const PORTAL_URL = `${CFG.apiUrl}/functions/v1/socios-portal`;
  const IDLE_MS = 8 * 60 * 60 * 1000;
  const REFRESH_MS = 60 * 1000;
  const PENDING_KEY = "socios_pending_sale_v1";
  const ACTIVE_KEY = "socios_last_active_v1";

  const $ = (id) => document.getElementById(id);
  const sb = window.supabase.createClient(CFG.apiUrl, CFG.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    db: { schema: "socios" },
  });

  const state = { user: null, cards: [], summary: null, history: [], deliveries: [], settlements: [], settlementLines: [], loadedAt: 0, loadedPerf: 0, tab: "inicio" };
  let saleDraft = null;      // { id, productId }
  let adjustDraft = null;    // { id, sale }
  let busy = false;

  // ---------------------------------------------------------------- utilidades de interfaz
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === false || value === null || value === undefined) continue;
      if (key === "class") el.className = value;
      else if (key === "text") el.textContent = value;
      else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? "" : value);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function toast(message, kind) {
    const node = h("div", { class: `toast${kind ? ` toast--${kind}` : ""}`, role: kind === "error" ? "alert" : "status", text: message });
    $("toasts").append(node);
    setTimeout(() => node.remove(), kind === "error" ? 9000 : 5000);
  }

  function setBusy(button, on, label) {
    busy = on;
    button.disabled = on;
    if (label) button.textContent = label;
  }

  function show(view) {
    $("view-login").hidden = view !== "login";
    $("view-app").hidden = view !== "app";
  }

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
  }
  function writeJson(key, value) {
    try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento: sigue funcionando */ }
  }

  function touchActivity() {
    const now = Date.now();
    if (now - (touchActivity.last || 0) < 30000) return;
    touchActivity.last = now;
    writeJson(ACTIVE_KEY, now);
  }

  // ---------------------------------------------------------------- acceso a la funcion de escrituras
  async function callPortal(route, body) {
    const { data } = await sb.auth.getSession();
    if (!data.session) throw { status: 401 };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    let response;
    try {
      response = await fetch(PORTAL_URL + route, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}`, apikey: CFG.publishableKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw { network: true };
    } finally {
      clearTimeout(timer);
    }
    let json = null;
    try { json = await response.json(); } catch { /* cuerpo vacio */ }
    if (response.ok) return json;
    throw { status: response.status, code: json && json.error, detail: json && json.detail };
  }

  // un error "definitivo" significa que el servidor respondio y NO creo nada; "incierto" (red, 5xx, 429, 503) puede haber creado la venta
  const isUncertain = (err) => err.network === true || err.status >= 500 || err.status === 429;

  // ---------------------------------------------------------------- carga de datos
  async function loadAll() {
    const [cards, summary, history, deliveries, settlements, settlementLines] = await Promise.all([
      sb.from("v_product_cards").select("*").order("name"),
      sb.from("v_partner_summary").select("*"),
      sb.from("v_sales_history").select("*").order("created_at", { ascending: false }).limit(200),
      sb.from("deliveries").select("id, guide_number, delivery_date, received_at, total_value_boomart, delivery_lines(product_name, sku, qty_received, unit_price_boomart), delivery_documents(id, kind, variant, version, storage_path)")
        .order("received_at", { ascending: false }).limit(60),
      sb.from("v_settlements").select("*").order("opened_at", { ascending: false }).limit(120),
      sb.from("v_settlement_lines").select("*").order("sold_on", { ascending: false }).limit(1000),
    ]);
    for (const result of [cards, summary, history, deliveries, settlements, settlementLines]) {
      if (result.error) {
        if (result.status === 401 || result.error.code === "PGRST301" || /JWT/i.test(result.error.message || "")) throw { status: 401 };
        throw { network: !result.status, status: result.status || 0, detail: result.error.message };
      }
    }
    state.cards = cards.data;
    state.summary = summary.data.length === 1 ? summary.data[0] : null;
    state.summaryCount = summary.data.length;
    state.history = history.data;
    state.deliveries = deliveries.data;
    state.settlements = settlements.data;
    state.settlementLines = settlementLines.data;
    state.loadedAt = Date.now();
    state.loadedPerf = performance.now();
  }

  async function refresh(quiet) {
    try {
      await loadAll();
      $("offline-banner").hidden = true;
      render();
    } catch (err) {
      if (err.status === 401) return handleExpired();
      $("offline-banner").hidden = false;
      if (!quiet) toast("No se pudo actualizar. Revisa tu conexión.", "warn");
    }
  }

  // ---------------------------------------------------------------- pintado
  function render() {
    renderHeader();
    renderPendingBanner();
    renderInicio();
    renderProductos();
    renderHistorial();
    renderEntregas();
    renderLiquidaciones();
  }

  function renderHeader() {
    $("partner-name").textContent = state.summary ? state.summary.name : "Portal de socios";
    $("partner-sub").textContent = state.summary ? "Portal de socios BoomArt" : "";
  }

  function stat(label, value, hint, gold) {
    return h("div", { class: "stat" }, h("div", { class: "stat__label", text: label }),
      h("div", { class: `stat__value${gold ? " stat__value--gold" : ""}`, text: value }), hint ? h("div", { class: "stat__hint", text: hint }) : null);
  }

  function frequencyText(summary) {
    const labels = { semanal: "cada semana", quincenal: "cada quincena", mensual: "cada mes", personalizada: "en las fechas acordadas" };
    const base = labels[summary.settlement_frequency] || "";
    return base ? `Se cuadra ${base}${summary.settlement_day ? ` (${summary.settlement_day})` : ""}.` : "";
  }

  function renderInicio() {
    const root = $("tab-inicio");
    root.replaceChildren();
    if (!state.summary) {
      root.append(h("div", { class: "empty" },
        h("p", { text: state.summaryCount > 1 ? "Esta cuenta es del personal de BoomArt. El portal de administración llega más adelante." : "Tu cuenta todavía no está asignada a un local. Avisa a BoomArt." })));
      return;
    }
    const s = state.summary;
    root.append(
      h("div", { class: "cards" },
        stat("Disponibles en tu local", String(s.available_qty), "unidades"),
        stat("Vendidas por cuadrar", String(s.sold_qty_pending), "unidades"),
        stat("Debes a BoomArt", U.formatMoney(s.boomart_debt_pending), "de lo vendido sin cuadrar"),
        stat("Tu ganancia", U.formatMoney(s.gain_pending), "de lo vendido sin cuadrar", true)),
      h("p", { class: "note", text: frequencyText(s) }),
      h("button", { class: "btn btn--primary btn--big btn--block", type: "button", onclick: () => openSale(null), text: "Registrar venta" }));
    const recent = state.history.filter((sale) => sale.status === "registrada").slice(0, 3);
    root.append(h("div", { class: "panel" }, h("h3", { text: "Últimas ventas" }),
      recent.length ? h("div", { class: "list" }, recent.map(saleItem)) : h("p", { class: "empty", text: "Todavía no registraste ventas." })));
  }

  function productCard(card) {
    const photo = card.photo_path && /^https:\/\//.test(card.photo_path)
      ? h("img", { class: "product__photo", src: card.photo_path, alt: "", loading: "lazy", referrerpolicy: "no-referrer" })
      : h("div", { class: "product__photo product__photo--empty", text: "Sin foto" });
    photo.addEventListener("error", () => photo.replaceWith(h("div", { class: "product__photo product__photo--empty", text: "Sin foto" })));
    const available = Number(card.available_qty);
    return h("div", { class: "product" }, photo,
      h("div", { class: "product__body" },
        h("div", { class: "product__name", text: card.name }),
        h("div", { class: "product__sku", text: card.sku }),
        h("div", { class: "product__meta" }, h("b", { text: String(available) }), ` disponibles · recibidos ${card.delivered_qty} · vendidos ${card.sold_qty}`),
        h("div", { class: "product__meta" }, "Precio BoomArt: ", h("b", { text: U.formatMoney(card.boomart_price) })),
        card.public_price !== null && card.public_price !== undefined
          ? h("div", { class: "product__meta" }, "Tu último precio: ", h("b", { text: U.formatMoney(card.public_price) })) : null,
        h("div", { class: "row" },
          available > 0 ? h("button", { class: "btn btn--primary btn--small", type: "button", onclick: () => openSale(card.product_id), text: "Vender" })
            : h("span", { class: "badge badge--off", text: "Agotado" }))));
  }

  function renderProductos() {
    const root = $("tab-productos");
    root.replaceChildren(h("h2", { text: "Tus productos" }));
    if (!state.cards.length) {
      root.append(h("div", { class: "empty", text: "Todavía no tienes productos. Cuando BoomArt te entregue mercadería aparecerá aquí." }));
      return;
    }
    root.append(h("div", { class: "products" }, state.cards.map(productCard)));
  }

  function saleBadges(sale) {
    const badges = [];
    if (sale.status === "anulada") badges.push(h("span", { class: "badge badge--off", text: "Anulada" }));
    else if (sale.settlement_id) badges.push(h("span", { class: "badge badge--ok", text: "En cuadre" }));
    else badges.push(h("span", { class: "badge badge--warn", text: "Pendiente de cuadre" }));
    if (sale.adjustment_status === "solicitada") badges.push(h("span", { class: "badge badge--warn", text: "Corrección solicitada" }));
    if (sale.adjustment_status === "aprobada") badges.push(h("span", { class: "badge badge--ok", text: "Corrección aprobada" }));
    if (sale.adjustment_status === "rechazada") badges.push(h("span", { class: "badge badge--red", text: "Corrección rechazada" }));
    return h("div", { class: "badges" }, badges);
  }

  function saleItem(sale) {
    const actions = [];
    const secondsLeft = undoSecondsLeft(sale);
    if (secondsLeft > 0) {
      actions.push(h("button", { class: "btn btn--small", type: "button", "data-sale": sale.sale_id, onclick: () => undoSale(sale), "data-undo": String(secondsLeft) },
        "Deshacer (", h("span", { "data-count": "1", text: U.countdown(secondsLeft) }), ")"));
    } else if (sale.status === "registrada" && !sale.settlement_id && sale.adjustment_status !== "solicitada") {
      actions.push(h("button", { class: "btn btn--small", type: "button", onclick: () => openAdjust(sale), text: "Pedir corrección" }));
    }
    return h("div", { class: `item${sale.status === "anulada" ? " item--void" : ""}` },
      h("div", { class: "item__top" }, h("span", { class: "item__title", text: `${sale.qty} × ${sale.product_name}` }), h("span", { class: "item__total", text: U.formatMoney(sale.total_public) })),
      h("div", { class: "item__sub", text: `${U.formatDateTime(sale.created_at)} · a ${U.formatMoney(sale.public_unit_price)} c/u${sale.sold_on && sale.sold_on !== U.localDay(new Date(sale.created_at), 0) ? ` · vendida el ${U.formatDay(sale.sold_on)}` : ""}` }),
      sale.status === "registrada" ? h("div", { class: "item__sub", text: `Debes a BoomArt ${U.formatMoney(sale.total_boomart)} · Tu ganancia ${U.formatMoney(sale.gain)}` }) : null,
      saleBadges(sale),
      actions.length ? h("div", { class: "item__actions" }, actions) : null);
  }

  function undoSecondsLeft(sale) {
    if (!sale.can_undo) return 0;
    const elapsed = (performance.now() - state.loadedPerf) / 1000;
    return Math.max(0, Math.ceil(Number(sale.undo_seconds) - elapsed));
  }

  function renderHistorial() {
    const root = $("tab-historial");
    root.replaceChildren(h("h2", { text: "Historial de ventas" }));
    if (!state.history.length) {
      root.append(h("div", { class: "empty", text: "Todavía no registraste ventas." }));
      return;
    }
    root.append(h("div", { class: "list" }, state.history.map(saleItem)));
  }

  function deliveryItem(delivery) {
    const guide = U.pickGuide(delivery.delivery_documents);
    return h("div", { class: "item" },
      h("div", { class: "item__top" }, h("span", { class: "item__title", text: delivery.guide_number }), h("span", { class: "item__total", text: U.formatMoney(delivery.total_value_boomart) })),
      h("div", { class: "item__sub", text: `Recibida el ${U.formatDay(delivery.delivery_date)}` }),
      h("ul", { class: "lines" }, (delivery.delivery_lines || []).map((line) =>
        h("li", {}, h("span", { text: `${line.qty_received} × ${line.product_name}` }), h("span", { text: U.formatMoney(line.unit_price_boomart) })))),
      guide ? h("div", { class: "item__actions" }, h("button", { class: "btn btn--small", type: "button", onclick: (event) => openGuide(guide, event.currentTarget), text: "Ver guía (PDF)" })) : null);
  }

  function renderEntregas() {
    const root = $("tab-entregas");
    root.replaceChildren(h("h2", { text: "Entregas recibidas" }));
    if (!state.deliveries.length) {
      root.append(h("div", { class: "empty", text: "Todavía no hay entregas registradas." }));
      return;
    }
    root.append(h("div", { class: "list" }, state.deliveries.map(deliveryItem)));
  }

  function settlementStatus(status) {
    return ({ abierta: "Abierta", en_revision: "En revisión", cuadrada: "Cuadrada", cobrada: "Cobrada", importada: "Importada en Studio" })[status] || status;
  }

  function settlementItem(settlement) {
    const lines = state.settlementLines.filter((line) => line.settlement_id === settlement.settlement_id);
    const paid = settlement.status === "cobrada" || settlement.status === "importada";
    const period = `${U.formatDay(settlement.period_start)} al ${U.formatDay(settlement.period_end)}`;
    return h("div", { class: "item" },
      h("div", { class: "item__top" },
        h("span", { class: "item__title", text: settlement.settlement_number }),
        h("span", { class: `badge ${paid ? "badge--ok" : settlement.status === "cuadrada" ? "badge--warn" : ""}`, text: settlementStatus(settlement.status) })),
      h("div", { class: "item__sub", text: `Periodo: ${period}` }),
      h("div", { class: "cards" },
        stat("Ventas", String(settlement.total_qty || 0), "unidades"),
        stat("Total vendido", U.formatMoney(settlement.total_public || 0), "precio al público"),
        stat("A pagar a BoomArt", U.formatMoney(settlement.total_boomart || 0), paid ? "pago registrado" : "monto del cuadre"),
        stat("Tu ganancia", U.formatMoney(settlement.total_partner_gain || 0), "en este periodo", true)),
      paid ? h("div", { class: "item__sub", text: `Cobrado el ${U.formatDay(settlement.paid_on)}${settlement.payment_reference ? ` · Ref. ${settlement.payment_reference}` : ""}` }) : null,
      lines.length ? h("ul", { class: "lines" }, lines.map((line) =>
        h("li", {}, h("span", { text: `${line.qty} × ${line.product_name}` }), h("span", { text: U.formatMoney(line.total_public) })))) :
        h("p", { class: "empty", text: settlement.status === "abierta" || settlement.status === "en_revision" ? "El detalle quedará congelado cuando BoomArt cierre el cuadre." : "Este cuadre no tiene ventas." }));
  }

  function renderLiquidaciones() {
    const root = $("tab-liquidaciones");
    root.replaceChildren(h("h2", { text: "Cuadres y pagos" }),
      h("p", { class: "note", text: "Aquí ves cuánto debes a BoomArt y cuánto ganaste en cada periodo. Los cuadres cerrados ya no cambian." }));
    if (!state.settlements.length) {
      root.append(h("div", { class: "empty", text: "Todavía no hay cuadres registrados." }));
      return;
    }
    root.append(h("div", { class: "list" }, state.settlements.map(settlementItem)));
  }

  async function openGuide(doc, button) {
    button.disabled = true;
    try {
      const { data, error } = await sb.storage.from("socios-docs").createSignedUrl(doc.storage_path, 120);
      if (error || !data || !data.signedUrl) throw new Error("sin enlace");
      const opened = window.open(data.signedUrl, "_blank", "noopener");
      if (!opened) window.location.assign(data.signedUrl);
    } catch {
      toast("No se pudo abrir la guía. Intenta de nuevo.", "error");
    } finally {
      button.disabled = false;
    }
  }

  function showTab(name) {
    state.tab = name;
    for (const button of document.querySelectorAll(".tabbar__btn")) {
      const active = button.dataset.tab === name;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    }
    for (const section of document.querySelectorAll(".tab")) section.hidden = section.id !== `tab-${name}`;
    window.scrollTo(0, 0);
    if (Date.now() - state.loadedAt > 15000) refresh(true);
  }

  // ---------------------------------------------------------------- registrar venta
  function pendingSale() {
    const pending = readJson(PENDING_KEY);
    return pending && state.user && pending.userId === state.user.id ? pending : null;
  }

  function renderPendingBanner() {
    const banner = $("pending-banner");
    const pending = pendingSale();
    banner.replaceChildren();
    banner.hidden = !pending;
    if (!pending) return;
    const card = state.cards.find((c) => c.product_id === pending.body.product_id);
    banner.append(h("span", { text: `Hay una venta sin confirmar (${pending.body.qty} × ${card ? card.name : "producto"}). No se duplicará al reintentar.` }),
      h("button", { class: "btn btn--small", type: "button", onclick: () => retryPending(), text: "Reintentar" }));
  }

  function availableCards() {
    return state.cards.filter((c) => Number(c.available_qty) > 0);
  }

  function selectedCard() {
    return state.cards.find((c) => c.product_id === $("sale-product").value) || null;
  }

  function openSale(productId) {
    const options = availableCards();
    if (!options.length) { toast("No tienes productos disponibles para vender.", "warn"); return; }
    if (pendingSale()) { toast("Primero confirma la venta pendiente.", "warn"); return; }
    const select = $("sale-product");
    select.replaceChildren(...options.map((c) => h("option", { value: c.product_id, text: `${c.name} (${c.available_qty})` })));
    select.value = options.some((c) => c.product_id === productId) ? productId : options[0].product_id;
    $("sale-qty").value = "1";
    $("sale-date").min = U.localDay(new Date(), -30);
    $("sale-date").max = U.localDay(new Date(), 0);
    $("sale-date").value = U.localDay(new Date(), 0);
    $("sale-date").dataset.touched = "";
    $("sale-error").hidden = true;
    saleDraft = { id: U.newId() };
    onSaleProductChange();
    $("dlg-sale").showModal();
    $("sale-price").focus();
  }

  function onSaleProductChange() {
    const card = selectedCard();
    if (!card) return;
    $("sale-avail").textContent = `(disponibles: ${card.available_qty})`;
    $("sale-price").value = card.public_price !== null && card.public_price !== undefined ? Number(card.public_price).toFixed(2) : "";
    $("sale-price-hint").textContent = card.public_price !== null && card.public_price !== undefined
      ? "Usamos el último precio que pusiste. Puedes cambiarlo." : "Escribe el precio al que vendes al público.";
    clampQty();
    updateSaleSummary();
  }

  function clampQty() {
    const card = selectedCard();
    const max = card ? Number(card.available_qty) : 1;
    const qty = U.parseQty($("sale-qty").value, max);
    if (qty === null) { const raw = Number($("sale-qty").value); $("sale-qty").value = String(raw > max ? max : 1); }
  }

  function updateSaleSummary() {
    const card = selectedCard();
    const qty = card ? U.parseQty($("sale-qty").value, Number(card.available_qty)) : null;
    const price = U.parseMoney($("sale-price").value);
    const box = $("sale-summary");
    box.replaceChildren();
    if (!card || qty === null || price === null) {
      box.append(h("div", { class: "summary__row" }, h("span", { class: "muted", text: "Completa la cantidad y el precio para ver el total." })));
      return;
    }
    const total = U.totalCents(qty, price) / 100;
    box.append(
      h("div", { class: "summary__row" }, h("span", { text: `${qty} × ${card.name}` }), h("span", { text: U.formatMoney(price) })),
      h("div", { class: "summary__row summary__row--total" }, h("span", { text: "Total de la venta" }), h("span", { text: U.formatMoney(total) })));
  }

  function saleSummaryRows(result, name) {
    return [
      h("div", { class: "summary__row" }, h("span", { text: `${result.qty} × ${name}` }), h("span", { text: `a ${U.formatMoney(result.public_unit_price)}` })),
      h("div", { class: "summary__row summary__row--total" }, h("span", { text: "Total de la venta" }), h("span", { text: U.formatMoney(result.total_public) })),
      h("div", { class: "summary__row" }, h("span", { text: "Debes a BoomArt" }), h("span", { text: U.formatMoney(result.total_boomart) })),
      h("div", { class: "summary__row" }, h("span", { text: "Tu ganancia" }), h("span", { text: U.formatMoney(result.gain) })),
    ];
  }

  async function submitSale(event) {
    event.preventDefault();
    if (busy) return;
    const submit = $("sale-submit");
    const error = $("sale-error");
    error.hidden = true;
    const pending = pendingSale();
    let body;
    if (pending) {
      body = pending.body;             // un envio sin confirmar manda: se reintenta EXACTAMENTE el mismo (mismo id), nunca uno nuevo
    } else {
      const card = selectedCard();
      const qty = card ? U.parseQty($("sale-qty").value, Number(card.available_qty)) : null;
      const price = U.parseMoney($("sale-price").value);
      if (!card) return fail("Elige un producto.");
      if (qty === null) return fail(`La cantidad debe ser un número entre 1 y ${card.available_qty}.`);
      if (price === null) return fail("Escribe el precio de venta, por ejemplo 15 o 15.50.");
      body = { id: saleDraft.id, product_id: card.product_id, qty, public_unit_price: price };
      const day = $("sale-date").value;
      if ($("sale-date").dataset.touched && day && day !== U.localDay(new Date(), 0)) body.sold_on = day;
      writeJson(PENDING_KEY, { userId: state.user.id, body, at: Date.now() });
    }
    setBusy(submit, true, "Registrando…");
    try {
      const result = await callPortal("/sales", body);
      writeJson(PENDING_KEY, null);
      $("dlg-sale").close();
      await refresh(true);
      showDone(result, body);
    } catch (err) {
      if (!isUncertain(err)) { writeJson(PENDING_KEY, null); saleDraft = { id: U.newId() }; }
      if (err.status === 401) { $("dlg-sale").close(); return handleExpired(); }
      fail(U.friendlyError(err));
      renderPendingBanner();
    } finally {
      setBusy(submit, false, "Confirmar venta");
    }
    function fail(message) { error.textContent = message; error.hidden = false; }
  }

  async function retryPending() {
    const pending = pendingSale();
    if (!pending || busy) return;
    busy = true;
    try {
      const result = await callPortal("/sales", pending.body);
      writeJson(PENDING_KEY, null);
      await refresh(true);
      showDone(result, pending.body);
    } catch (err) {
      if (err.status === 401) return handleExpired();
      if (!isUncertain(err)) writeJson(PENDING_KEY, null);
      toast(U.friendlyError(err), "error");
      renderPendingBanner();
    } finally {
      busy = false;
    }
  }

  let lastDone = null;
  function showDone(result, body) {
    const card = state.cards.find((c) => c.product_id === body.product_id);
    const name = card ? card.name : "producto";
    lastDone = result;
    $("dlg-done-title").textContent = result.result === "repetido" ? "Esa venta ya estaba registrada" : "Venta registrada";
    $("done-body").replaceChildren(...saleSummaryRows(result, name));
    $("done-undo-note").textContent = "Si te equivocaste, puedes deshacerla durante 15 minutos (aquí o en el Historial).";
    $("done-undo").hidden = result.result === "repetido";
    $("dlg-done").showModal();
  }

  async function undoSale(sale) {
    if (busy) return;
    if (!window.confirm(`¿Deshacer la venta de ${sale.qty} × ${sale.product_name}? Las unidades vuelven a tu stock.`)) return;
    busy = true;
    try {
      const result = await callPortal("/sales/void", { sale_id: sale.sale_id });
      toast(result.result === "repetido" ? "Esa venta ya estaba deshecha." : "Venta deshecha. Las unidades volvieron a tu stock.");
      await refresh(true);
    } catch (err) {
      if (err.status === 401) return handleExpired();
      toast(U.friendlyError(err), "error");
      await refresh(true);
    } finally {
      busy = false;
    }
  }

  // ---------------------------------------------------------------- pedir correccion
  function selectedKind() {
    const checked = document.querySelector("input[name='adjust-kind']:checked");
    return checked ? checked.value : "anular";
  }

  function onAdjustKindChange() {
    const kind = selectedKind();
    $("adjust-qty-field").hidden = kind !== "corregir_cantidad";
    $("adjust-price-field").hidden = kind !== "corregir_precio";
  }

  function openAdjust(sale) {
    adjustDraft = { id: U.newId(), sale };
    $("adjust-sale").textContent = `${sale.qty} × ${sale.product_name} · ${U.formatMoney(sale.total_public)} · ${U.formatDateTime(sale.created_at)}`;
    document.querySelector("input[name='adjust-kind'][value='anular']").checked = true;
    $("adjust-qty").value = "";
    $("adjust-price").value = "";
    $("adjust-reason").value = "";
    $("adjust-error").hidden = true;
    onAdjustKindChange();
    $("dlg-adjust").showModal();
  }

  async function submitAdjust(event) {
    event.preventDefault();
    if (busy || !adjustDraft) return;
    const error = $("adjust-error");
    const fail = (message) => { error.textContent = message; error.hidden = false; };
    error.hidden = true;
    const sale = adjustDraft.sale;
    const kind = selectedKind();
    const reason = $("adjust-reason").value.trim();
    if (reason.length < 5) return fail("Cuéntanos el motivo (al menos 5 letras).");
    const body = { id: adjustDraft.id, sale_id: sale.sale_id, kind, reason };
    if (kind === "corregir_cantidad") {
      const qty = U.parseQty($("adjust-qty").value, sale.qty - 1);
      if (qty === null) return fail(`La cantidad correcta debe ser menor que ${sale.qty} (mínimo 1).`);
      body.new_qty = qty;
    }
    if (kind === "corregir_precio") {
      const price = U.parseMoney($("adjust-price").value);
      if (price === null) return fail("Escribe el precio correcto, por ejemplo 15 o 15.50.");
      if (Number(price) === Number(sale.public_unit_price)) return fail("Ese es el mismo precio que ya tiene la venta.");
      body.new_price = price;
    }
    const submit = $("adjust-submit");
    setBusy(submit, true, "Enviando…");
    try {
      const result = await callPortal("/sales/adjust", body);
      $("dlg-adjust").close();
      toast(result.result === "repetido" ? "Ese pedido ya estaba enviado." : "Pedido enviado. BoomArt lo revisará.");
      adjustDraft = null;
      await refresh(true);
    } catch (err) {
      if (err.status === 401) { $("dlg-adjust").close(); return handleExpired(); }
      if (!isUncertain(err)) adjustDraft = { id: U.newId(), sale };
      fail(U.friendlyError(err));
    } finally {
      setBusy(submit, false, "Enviar pedido");
    }
  }

  // ---------------------------------------------------------------- sesion
  function handleExpired() {
    state.user = null;
    sb.auth.signOut({ scope: "local" }).catch(() => {});
    show("login");
    showLoginError("Tu sesión venció. Entra de nuevo.");
  }

  function showLoginError(message) {
    const node = $("login-error");
    node.textContent = message;
    node.hidden = !message;
  }

  async function onLogin(event) {
    event.preventDefault();
    if (busy) return;
    showLoginError("");
    const email = U.loginEmail($("login-user").value, CFG.loginDomain);
    const password = $("login-pass").value;
    if (!email || password.length < 1) return showLoginError("Usuario o clave incorrectos.");
    const button = $("login-submit");
    setBusy(button, true, "Entrando…");
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.status === 429) return showLoginError("Demasiados intentos. Espera un minuto e intenta de nuevo.");
        if (!error.status || error.status >= 500) return showLoginError("No hay conexión con el portal. Intenta de nuevo.");
        return showLoginError("Usuario o clave incorrectos.");
      }
      $("login-pass").value = "";
      state.user = data.user;
      writeJson(ACTIVE_KEY, Date.now());
      await start();
    } catch {
      showLoginError("No hay conexión con el portal. Intenta de nuevo.");
    } finally {
      setBusy(button, false, "Entrar");
    }
  }

  async function logout() {
    state.user = null;
    state.cards = []; state.history = []; state.deliveries = []; state.settlements = []; state.settlementLines = []; state.summary = null;
    writeJson(ACTIVE_KEY, null);
    try { await sb.auth.signOut(); } catch { /* aunque falle la red, la sesion local se borra */ }
    show("login");
    $("login-user").focus();
  }

  async function start() {
    show("app");
    try {
      await loadAll();
    } catch (err) {
      if (err.status === 401) return handleExpired();
      $("offline-banner").hidden = false;
    }
    render();
    showTab("inicio");
    if (pendingSale()) retryPending();
  }

  async function boot() {
    const lastActive = readJson(ACTIVE_KEY);
    const { data } = await sb.auth.getSession();
    if (data.session && lastActive && Date.now() - lastActive > IDLE_MS) {
      await sb.auth.signOut({ scope: "local" }).catch(() => {});
      show("login");
      showLoginError("Por seguridad cerramos tu sesión después de un rato sin uso. Entra de nuevo.");
      return;
    }
    if (data.session) {
      state.user = data.session.user;
      touchActivity();
      await start();
    } else {
      show("login");
    }
  }

  // ---------------------------------------------------------------- conexiones de la interfaz
  $("login-form").addEventListener("submit", onLogin);
  $("btn-logout").addEventListener("click", logout);
  for (const button of document.querySelectorAll(".tabbar__btn")) button.addEventListener("click", () => showTab(button.dataset.tab));
  $("sale-form").addEventListener("submit", submitSale);
  $("sale-product").addEventListener("change", onSaleProductChange);
  $("sale-qty").addEventListener("input", updateSaleSummary);
  $("sale-qty").addEventListener("blur", () => { clampQty(); updateSaleSummary(); });
  $("sale-price").addEventListener("input", updateSaleSummary);
  $("sale-date").addEventListener("change", () => { $("sale-date").dataset.touched = "1"; });
  $("sale-minus").addEventListener("click", () => { const q = U.parseQty($("sale-qty").value) || 1; $("sale-qty").value = String(Math.max(1, q - 1)); updateSaleSummary(); });
  $("sale-plus").addEventListener("click", () => {
    const card = selectedCard();
    const max = card ? Number(card.available_qty) : 1;
    const q = U.parseQty($("sale-qty").value) || 0;
    $("sale-qty").value = String(Math.min(max, q + 1));
    updateSaleSummary();
  });
  $("sale-cancel").addEventListener("click", () => $("dlg-sale").close());
  $("adjust-form").addEventListener("submit", submitAdjust);
  $("adjust-cancel").addEventListener("click", () => $("dlg-adjust").close());
  for (const radio of document.querySelectorAll("input[name='adjust-kind']")) radio.addEventListener("change", onAdjustKindChange);
  $("done-close").addEventListener("click", () => $("dlg-done").close());
  $("done-undo").addEventListener("click", async () => {
    if (!lastDone || busy) return;
    busy = true;
    try {
      const result = await callPortal("/sales/void", { sale_id: lastDone.sale_id });
      $("dlg-done").close();
      toast(result.result === "repetido" ? "Esa venta ya estaba deshecha." : "Venta deshecha. Las unidades volvieron a tu stock.");
      await refresh(true);
    } catch (err) {
      if (err.status === 401) { $("dlg-done").close(); return handleExpired(); }
      toast(U.friendlyError(err), "error");
    } finally {
      busy = false;
    }
  });
  window.addEventListener("online", () => { $("offline-banner").hidden = true; if (state.user) refresh(true); });
  window.addEventListener("offline", () => { $("offline-banner").hidden = false; });
  for (const name of ["pointerdown", "keydown"]) window.addEventListener(name, touchActivity, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.user && Date.now() - state.loadedAt > REFRESH_MS) refresh(true);
  });
  setInterval(() => {
    if (!state.user) return;
    let expired = false;
    for (const node of document.querySelectorAll("[data-undo]")) {
      const card = state.history.find((sale) => sale.sale_id === node.getAttribute("data-sale"));
      const left = card ? undoSecondsLeft(card) : 0;
      const span = node.querySelector("[data-count]");
      if (left > 0 && span) span.textContent = U.countdown(left); else expired = true;
    }
    if (expired) { renderHistorial(); renderInicio(); }
    if (Date.now() - state.loadedAt > 5 * REFRESH_MS && document.visibilityState === "visible") refresh(true);
  }, 1000);

  boot().catch(() => { show("login"); showLoginError("No se pudo iniciar el portal. Recarga la página."); });
})();
