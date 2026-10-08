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

  const state = { user: null, priceDrafts: {}, cards: [], summary: null, history: [], pendingAssignments: [], deliveries: [], returns: [], returnLines: [], returnDocuments: [], settlements: [], settlementLines: [], loadedAt: 0, loadedPerf: 0, tab: "inicio" };
  let saleDraft = null;      // { id, productId }
  let adjustDraft = null;    // { id, sale }
  let comboDraft = null;     // { id }
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
    const [cards, summary, history, pendingAssignments, deliveries, returns, returnLines, returnDocuments, settlements, settlementLines] = await Promise.all([
      sb.from("v_product_cards").select("*").order("name"),
      sb.from("v_partner_summary").select("*"),
      sb.from("v_sales_history").select("*").order("created_at", { ascending: false }).limit(200),
      sb.from("v_pending_assignments").select("*").order("delivery_date", { ascending: false }).limit(500),
      sb.from("deliveries").select("id, guide_number, delivery_date, received_at, total_value_boomart, delivery_lines(product_name, sku, qty_received, unit_price_boomart), delivery_documents(id, kind, variant, version, storage_path)")
        .order("received_at", { ascending: false }).limit(60),
      sb.from("v_returns").select("*").order("occurred_on", { ascending: false }).limit(120),
      sb.from("v_return_lines").select("*").order("occurred_on", { ascending: false }).limit(1000),
      sb.from("return_documents").select("id, return_id, kind, storage_path, created_at").eq("superseded", false).order("created_at", { ascending: false }).limit(240),
      sb.from("v_settlements").select("*").order("opened_at", { ascending: false }).limit(120),
      sb.from("v_settlement_lines").select("*").order("sold_on", { ascending: false }).limit(1000),
    ]);
    for (const result of [cards, summary, history, pendingAssignments, deliveries, returns, returnLines, returnDocuments, settlements, settlementLines]) {
      if (result.error) {
        if (result.status === 401 || result.error.code === "PGRST301" || /JWT/i.test(result.error.message || "")) throw { status: 401 };
        throw { network: !result.status, status: result.status || 0, detail: result.error.message };
      }
    }
    state.cards = cards.data;
    state.summary = summary.data.length === 1 ? summary.data[0] : null;
    state.summaryCount = summary.data.length;
    state.history = U.groupSales(history.data);        // un combo (que el servidor puede guardar en 2 filas) se ve como UNA venta
    state.pendingAssignments = pendingAssignments.data;
    state.deliveries = deliveries.data;
    state.returns = returns.data;
    state.returnLines = returnLines.data;
    state.returnDocuments = returnDocuments.data;
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
    renderRetiros();
    renderLiquidaciones();
  }

  function renderHeader() {
    $("partner-name").textContent = state.summary ? state.summary.name : "Portal de socios";
    $("partner-sub").textContent = state.summary ? (state.summary.is_test ? "LOCAL DE PRUEBA · no cuenta como real" : "Portal de socios BoomArt") : "";
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
      h("button", { class: "btn btn--primary btn--big btn--block", type: "button", onclick: () => openSale(null), text: "Registrar venta" }),
      h("button", { class: "btn btn--ghost btn--block", type: "button", onclick: () => openCombo(null), text: "Vender en combo (precio especial)" }));
    const recent = state.history.filter((sale) => sale.status === "registrada").slice(0, 3);
    root.append(h("div", { class: "panel" }, h("h3", { text: "Últimas ventas" }),
      recent.length ? h("div", { class: "list" }, recent.map(saleItem)) : h("p", { class: "empty", text: "Todavía no registraste ventas." })));
  }

  // ---------------------------------------------------------------- productos: lo que te cuesta, tu precio de venta y tu ganancia
  function savedPrice(card) {
    return card.public_price !== null && card.public_price !== undefined ? Number(card.public_price) : null;
  }

  function profitInfo(price, cost) {
    if (price === null) return { text: "Escribe tu precio de venta para ver cuánto ganas por unidad.", cls: "" };
    const cents = U.toCents(price) - U.toCents(cost);
    if (cents < 0) return { text: `Con ese precio pierdes ${U.formatMoney(-cents / 100)} por unidad.`, cls: " profit--neg" };
    return { text: `Ganas ${U.formatMoney(cents / 100)} por unidad.`, cls: " profit--pos" };
  }

  function productCard(card) {
    const photo = card.photo_path && /^https:\/\//.test(card.photo_path)
      ? h("img", { class: "product__photo", src: card.photo_path, alt: "", loading: "lazy", referrerpolicy: "no-referrer" })
      : h("div", { class: "product__photo product__photo--empty", text: "Sin foto" });
    photo.addEventListener("error", () => photo.replaceWith(h("div", { class: "product__photo product__photo--empty", text: "Sin foto" })));
    const available = Number(card.available_qty);
    const saved = savedPrice(card);
    const draft = Object.prototype.hasOwnProperty.call(state.priceDrafts, card.product_id) ? state.priceDrafts[card.product_id] : null;
    const input = h("input", { class: "price-input", type: "text", inputmode: "decimal", placeholder: "0.00", autocomplete: "off",
      value: draft !== null ? draft : (saved !== null ? saved.toFixed(2) : ""), "aria-label": `Tu precio de venta de ${card.name}` });
    const save = h("button", { class: "btn btn--small", type: "button", text: "Guardar" });
    const profit = h("div", { class: "profit" });
    const refreshLine = () => {
      const typed = U.parseMoney(input.value);
      const info = profitInfo(typed !== null ? Number(typed) : saved, card.boomart_price);
      profit.textContent = info.text;
      profit.className = `profit${info.cls}`;
      save.disabled = typed === null || Number(typed) <= 0 || (saved !== null && Number(typed) === saved);
    };
    input.addEventListener("input", () => { state.priceDrafts[card.product_id] = input.value; refreshLine(); });
    save.addEventListener("click", () => savePrice(card, input, save));
    refreshLine();
    return h("div", { class: "product" }, photo,
      h("div", { class: "product__body" },
        h("div", { class: "product__name", text: card.name }),
        h("div", { class: "product__sku", text: card.sku }),
        h("div", { class: "product__meta" }, h("b", { text: String(available) }), ` disponibles · recibidos ${card.delivered_qty} · vendidos ${card.sold_qty} · retirados ${card.returned_qty || 0} · bajas ${card.written_off_qty || 0}`),
        h("div", { class: "product__meta" }, "Te cuesta (precio BoomArt): ", h("b", { text: U.formatMoney(card.boomart_price) }), " c/u"),
        h("div", { class: "product__price" }, h("span", { class: "product__label", text: "Tu precio de venta (c/u)" }), h("div", { class: "row" }, input, save)),
        profit,
        h("div", { class: "product__actions" },
          available > 0 ? h("button", { class: "btn btn--primary btn--small", type: "button", onclick: () => openSale(card.product_id), text: "Vender" })
            : h("span", { class: "badge badge--off", text: "Agotado" }),
          available >= 2 ? h("button", { class: "btn btn--small", type: "button", onclick: () => openCombo(card.product_id), text: "Combo" }) : null)));
  }

  async function savePrice(card, input, button) {
    if (busy) return;
    const price = U.parseMoney(input.value);
    if (price === null || Number(price) <= 0) { toast("Escribe un precio mayor que 0, por ejemplo 8 o 8.50.", "warn"); return; }
    setBusy(button, true, "Guardando…");
    try {
      await callPortal("/prices", { product_id: card.product_id, public_price: price });
      delete state.priceDrafts[card.product_id];
      input.blur();                      // si el campo sigue con el foco (p. ej. en el celular) la lista no se redibujaria con el precio ya guardado
      toast(`Precio de venta guardado: ${U.formatMoney(price)}`);
      await refresh(true);
    } catch (err) {
      if (err.status === 401) return handleExpired();
      toast(U.friendlyError(err), "error");
    } finally {
      setBusy(button, false, "Guardar");
    }
  }

  function renderProductos() {
    const root = $("tab-productos");
    const active = document.activeElement;
    if (active && active.classList && active.classList.contains("price-input") && root.contains(active)) return;   // no se borra lo que se esta escribiendo
    root.replaceChildren(h("h2", { text: "Tus productos" }));
    if (!state.cards.length) {
      root.append(h("div", { class: "empty", text: "Todavía no tienes productos. Cuando BoomArt te entregue mercadería aparecerá aquí." }));
      return;
    }
    root.append(h("p", { class: "note", text: "Fija tu precio de venta de cada producto una sola vez; al vender, el portal calcula lo que debes a BoomArt y tu ganancia." }),
      h("div", { class: "products" }, state.cards.map(productCard)));
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
        sale.isCombo ? "Deshacer combo (" : "Deshacer (", h("span", { "data-count": "1", text: U.countdown(secondsLeft) }), ")"));
    } else if (sale.status === "registrada" && !sale.settlement_id && sale.adjustment_status !== "solicitada") {
      actions.push(h("button", { class: "btn btn--small", type: "button", onclick: () => openAdjust(sale), text: "Pedir corrección" }));
    }
    const soldOn = sale.sold_on && sale.sold_on !== U.localDay(new Date(sale.created_at), 0) ? ` · vendida el ${U.formatDay(sale.sold_on)}` : "";
    const sub = sale.isCombo
      ? `${U.formatDateTime(sale.created_at)} · combo a ${U.formatMoney(sale.total_public)} (precio normal ${U.formatMoney(sale.list_total)} · descuento ${U.formatMoney(sale.discount)})${soldOn}`
      : `${U.formatDateTime(sale.created_at)} · a ${U.formatMoney(sale.public_unit_price)} c/u${soldOn}`;
    return h("div", { class: `item${sale.status === "anulada" ? " item--void" : ""}` },
      h("div", { class: "item__top" }, h("span", { class: "item__title", text: `${sale.isCombo ? "Combo: " : ""}${sale.qty} × ${sale.product_name}` }), h("span", { class: "item__total", text: U.formatMoney(sale.total_public) })),
      h("div", { class: "item__sub", text: sub }),
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

  function pendingAssignmentItems() {
    const grouped = new Map();
    for (const line of state.pendingAssignments) {
      if (!grouped.has(line.assignment_id)) grouped.set(line.assignment_id, { ...line, lines: [] });
      grouped.get(line.assignment_id).lines.push(line);
    }
    return [...grouped.values()].map((assignment) => h("div", { class: "item" },
      h("div", { class: "item__top" },
        h("span", { class: "item__title", text: assignment.guide_number }),
        h("span", { class: "badge badge--warn", text: "Por recibir" })),
      h("div", { class: "item__sub", text: `Entrega prevista: ${U.formatDay(assignment.delivery_date)}` }),
      h("p", { class: "note", text: "BoomArt ya separó estas piezas para ti. Aún no cuentan como stock y no se pueden vender desde el portal." }),
      h("ul", { class: "lines" }, assignment.lines.map((line) =>
        h("li", {}, h("span", { text: `${line.qty_assigned} × ${line.product_name}` }),
          h("span", { text: U.formatMoney(line.unit_price_boomart) })))))
    );
  }

  function renderEntregas() {
    const root = $("tab-entregas");
    root.replaceChildren(h("h2", { text: "Entregas" }));
    const pending = pendingAssignmentItems();
    if (pending.length) root.append(h("h3", { text: "Por recibir" }), h("div", { class: "list" }, pending));
    if (state.deliveries.length) {
      root.append(h("h3", { text: "Recibidas · disponibles para vender" }),
        h("div", { class: "list" }, state.deliveries.map(deliveryItem)));
    } else if (!pending.length) {
      root.append(h("div", { class: "empty", text: "Todavía no hay entregas registradas." }));
    }
  }

  function returnReason(reason) {
    return ({ retiro: "Retiro al taller", rotacion: "Retiro por rotación", danio: "Baja por daño", perdida: "Baja por pérdida" })[reason] || reason;
  }

  function returnItem(item) {
    const lines = state.returnLines.filter((line) => line.return_id === item.return_id);
    const document = state.returnDocuments.find((doc) => doc.return_id === item.return_id && doc.kind === "constancia");
    return h("div", { class: "item" },
      h("div", { class: "item__top" },
        h("span", { class: "item__title", text: item.return_number }),
        h("span", { class: "badge badge--ok", text: "Confirmada" })),
      h("div", { class: "item__sub", text: `Visita del ${U.formatDay(item.occurred_on)} · ${item.total_qty} unidad(es)` }),
      h("ul", { class: "lines" }, lines.map((line) =>
        h("li", {}, h("span", { text: `${line.qty} × ${line.product_name} · ${returnReason(line.reason)}` }),
          h("span", { text: line.responsible === "local" ? "Responsable: local" : "Responsable: BoomArt" })))),
      Number(item.total_charge) > 0 ? h("p", { class: "note", text: `Cargo al próximo cuadre: ${U.formatMoney(item.total_charge)}` }) : null,
      document ? h("div", { class: "item__actions" }, h("button", { class: "btn btn--small", type: "button",
        onclick: (event) => openGuide(document, event.currentTarget), text: "Ver constancia (PDF)" })) : null);
  }

  function renderRetiros() {
    const root = $("tab-retiros");
    root.replaceChildren(h("h2", { text: "Retiros y bajas" }),
      h("p", { class: "note", text: "Aquí quedan las visitas confirmadas por BoomArt: productos retirados, rotados, dañados o perdidos." }));
    if (!state.returns.length) {
      root.append(h("div", { class: "empty", text: "Todavía no hay retiros ni bajas registrados." }));
      return;
    }
    root.append(h("div", { class: "list" }, state.returns.map(returnItem)));
  }

  function settlementStatus(status) {
    return ({ abierta: "Abierta", en_revision: "En revisión", cuadrada: "Cuadrada", cobrada: "Cobrada", importada: "Importada en Studio", anulada: "Anulada" })[status] || status;
  }

  function settlementItem(settlement) {
    const lines = state.settlementLines.filter((line) => line.settlement_id === settlement.settlement_id);
    const reviewing = settlement.status === "en_revision";
    const paid = settlement.status === "cobrada" || settlement.status === "importada";
    const period = `${U.formatDay(settlement.period_start)} al ${U.formatDay(settlement.period_end)}`;
    return h("div", { class: "item" },
      h("div", { class: "item__top" },
        h("span", { class: "item__title", text: settlement.settlement_number }),
        h("span", { class: `badge ${paid ? "badge--ok" : settlement.status === "cuadrada" ? "badge--warn" : ""}`, text: settlementStatus(settlement.status) })),
      h("div", { class: "item__sub", text: `Periodo: ${period}` }),
      // mientras BoomArt revisa, los importes todavia no existen: mostrar S/ 0.00 haria creer que no se debe nada
      reviewing
        ? h("p", { class: "note", text: "BoomArt está revisando este cuadre. Los importes se calculan y se congelan cuando lo cierre; mientras tanto tus ventas siguen contando en «Inicio»." })
        : h("div", { class: "cards" },
          stat("Ventas", String(settlement.total_qty || 0), "unidades"),
          stat("Total vendido", U.formatMoney(settlement.total_public || 0), "precio al público"),
          stat("A pagar a BoomArt", U.formatMoney(settlement.total_boomart || 0), paid ? "pago registrado" : "monto del cuadre"),
          stat("Tu ganancia", U.formatMoney(settlement.total_partner_gain || 0), "en este periodo", true)),
      paid ? h("div", { class: "item__sub", text: `Cobrado el ${U.formatDay(settlement.paid_on)}${settlement.payment_reference ? ` · Ref. ${settlement.payment_reference}` : ""}` }) : null,
      reviewing ? null : (lines.length ? h("ul", { class: "lines" }, lines.map((line) =>
        h("li", {}, h("span", { text: `${line.qty} × ${line.product_name}` }), h("span", { text: U.formatMoney(line.total_public) })))) :
        h("p", { class: "empty", text: "Este cuadre no tiene ventas." })));
  }

  function renderLiquidaciones() {
    const root = $("tab-liquidaciones");
    root.replaceChildren(h("h2", { text: "Cuadres y pagos" }),
      h("p", { class: "note", text: "Aquí ves cuánto debes a BoomArt y cuánto ganaste en cada periodo. Los cuadres cerrados ya no cambian." }));
    // el borrador de BoomArt (abierta) y un cuadre anulado no son del socio: solo ve lo que ya esta en revision, cuadrado o cobrado
    const visible = state.settlements.filter((row) => ["en_revision", "cuadrada", "cobrada", "importada"].includes(row.status));
    if (!visible.length) {
      root.append(h("div", { class: "empty", text: "Todavía no hay cuadres registrados." }));
      return;
    }
    root.append(h("div", { class: "list" }, visible.map(settlementItem)));
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
    $("sale-save-price").checked = true;
    $("sale-error").hidden = true;
    saleDraft = { id: U.newId() };
    onSaleProductChange();
    $("dlg-sale").showModal();
    $("sale-price").focus();
  }

  function onSaleProductChange() {
    const card = selectedCard();
    if (!card) return;
    const saved = savedPrice(card);
    $("sale-avail").textContent = `(disponibles: ${card.available_qty})`;
    $("sale-cost").textContent = `Te cuesta ${U.formatMoney(card.boomart_price)} cada una (precio BoomArt).`;
    $("sale-price").value = saved !== null ? saved.toFixed(2) : "";
    $("sale-price-hint").textContent = saved !== null
      ? "Es tu precio de venta guardado. Si lo cambias aquí, vale solo para esta venta."
      : "Todavía no fijaste tu precio de venta: escríbelo aquí.";
    $("sale-save-wrap").hidden = saved !== null;
    clampQty();
    updateSaleSummary();
  }

  function clampQty() {
    const card = selectedCard();
    const max = card ? Number(card.available_qty) : 1;
    const qty = U.parseQty($("sale-qty").value, max);
    if (qty === null) { const raw = Number($("sale-qty").value); $("sale-qty").value = String(raw > max ? max : 1); }
  }

  function summaryRow(label, value, extra) {
    return h("div", { class: `summary__row${extra ? ` ${extra}` : ""}` }, h("span", { text: label }), h("span", { text: value }));
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
    const total = U.totalCents(qty, price);
    const debt = U.fifoCostCents(card.boomart_lots, qty);
    box.append(
      summaryRow(`${qty} × ${card.name}`, U.formatMoney(price)),
      summaryRow("Total de la venta", U.formatMoney(total / 100), "summary__row--total"));
    if (debt !== null) {
      box.append(summaryRow("Debes a BoomArt", U.formatMoney(debt / 100)),
        summaryRow("Tu ganancia", U.formatMoney((total - debt) / 100), total - debt < 0 ? "summary__row--neg" : ""));
    }
  }

  function saleSummaryRows(result, name) {
    return [
      h("div", { class: "summary__row" }, h("span", { text: `${result.qty} × ${name}` }), h("span", { text: `a ${U.formatMoney(result.public_unit_price)}` })),
      h("div", { class: "summary__row summary__row--total" }, h("span", { text: "Total de la venta" }), h("span", { text: U.formatMoney(result.total_public) })),
      h("div", { class: "summary__row" }, h("span", { text: "Debes a BoomArt" }), h("span", { text: U.formatMoney(result.total_boomart) })),
      h("div", { class: "summary__row" }, h("span", { text: "Tu ganancia" }), h("span", { text: U.formatMoney(result.gain) })),
    ];
  }

  function comboSummaryRows(result, name) {
    return [
      h("div", { class: "summary__row" }, h("span", { text: `Combo: ${result.qty} × ${name}` }), h("span", { text: U.formatMoney(result.total_public) })),
      h("div", { class: "summary__row" }, h("span", { text: "Al precio normal serían" }), h("span", { text: U.formatMoney(result.list_total) })),
      h("div", { class: "summary__row summary__row--total" }, h("span", { text: "Descuento por combo" }), h("span", { text: U.formatMoney(result.discount) })),
      h("div", { class: "summary__row" }, h("span", { text: "Debes a BoomArt" }), h("span", { text: U.formatMoney(result.total_boomart) })),
      h("div", { class: "summary__row" }, h("span", { text: "Tu ganancia" }), h("span", { text: U.formatMoney(result.gain) })),
    ];
  }

  async function saveSalePrice(body) {
    try {
      await callPortal("/prices", { product_id: body.product_id, public_price: body.public_unit_price });
      toast("Guardamos ese precio como tu precio de venta.");
    } catch {
      /* la venta ya quedo registrada; el precio se puede guardar despues en Productos */
    }
  }

  async function submitSale(event) {
    event.preventDefault();
    if (busy) return;
    const submit = $("sale-submit");
    const error = $("sale-error");
    error.hidden = true;
    const pending = pendingSale();
    let body;
    let savePriceAfter = false;
    if (pending) {
      body = pending.body;             // un envio sin confirmar manda: se reintenta EXACTAMENTE el mismo (mismo id), nunca uno nuevo
      savePriceAfter = pending.savePrice === true;
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
      savePriceAfter = !$("sale-save-wrap").hidden && $("sale-save-price").checked && Number(price) > 0;
      writeJson(PENDING_KEY, { userId: state.user.id, route: "/sales", body, at: Date.now(), savePrice: savePriceAfter });
    }
    setBusy(submit, true, "Registrando…");
    try {
      const result = await callPortal("/sales", body);
      writeJson(PENDING_KEY, null);
      $("dlg-sale").close();
      if (savePriceAfter) await saveSalePrice(body);
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

  // ---------------------------------------------------------------- vender en combo (precio especial, un solo producto)
  function selectedComboCard() {
    return state.cards.find((c) => c.product_id === $("combo-product").value) || null;
  }

  function openCombo(productId) {
    const options = state.cards.filter((c) => Number(c.available_qty) >= 2);
    if (!options.length) { toast("Para armar un combo necesitas al menos 2 unidades de un producto.", "warn"); return; }
    if (pendingSale()) { toast("Primero confirma la venta pendiente.", "warn"); return; }
    const select = $("combo-product");
    select.replaceChildren(...options.map((c) => h("option", { value: c.product_id, text: `${c.name} (${c.available_qty})` })));
    select.value = options.some((c) => c.product_id === productId) ? productId : options[0].product_id;
    $("combo-qty").value = "2";
    $("combo-price").value = "";
    $("combo-date").min = U.localDay(new Date(), -30);
    $("combo-date").max = U.localDay(new Date(), 0);
    $("combo-date").value = U.localDay(new Date(), 0);
    $("combo-date").dataset.touched = "";
    $("combo-error").hidden = true;
    comboDraft = { id: U.newId() };
    onComboProductChange();
    $("dlg-combo").showModal();
    $("combo-price").focus();
  }

  function onComboProductChange() {
    const card = selectedComboCard();
    if (!card) return;
    const saved = savedPrice(card);
    $("combo-avail").textContent = `(disponibles: ${card.available_qty})`;
    $("combo-cost").textContent = `Te cuesta ${U.formatMoney(card.boomart_price)} cada una (precio BoomArt).`;
    $("combo-hint").textContent = saved === null
      ? "Primero guarda tu precio de venta de este producto en la pestaña Productos."
      : `Tu precio normal es ${U.formatMoney(saved)} c/u: el combo debe costar menos que la suma.`;
    clampComboQty();
    updateComboSummary();
  }

  function clampComboQty() {
    const card = selectedComboCard();
    const max = card ? Number(card.available_qty) : 2;
    const qty = U.parseQty($("combo-qty").value, max);
    if (qty === null || qty < 2) { const raw = Number($("combo-qty").value); $("combo-qty").value = String(raw > max ? max : 2); }
  }

  function updateComboSummary() {
    const card = selectedComboCard();
    const box = $("combo-summary");
    box.replaceChildren();
    const saved = card ? savedPrice(card) : null;
    const qty = card ? U.parseQty($("combo-qty").value, Number(card.available_qty)) : null;
    const total = U.parseMoney($("combo-price").value);
    $("combo-submit").disabled = saved === null;
    if (!card || saved === null || qty === null || qty < 2 || total === null) {
      box.append(h("div", { class: "summary__row" }, h("span", { class: "muted", text: "Completa la cantidad y el precio del combo para ver los números." })));
      return;
    }
    const p = U.comboPreview(qty, saved, total, card.boomart_lots);
    box.append(
      summaryRow(`${qty} × ${card.name} al precio normal`, U.formatMoney(p.listCents / 100)),
      summaryRow("Precio del combo", U.formatMoney(p.totalCents / 100), "summary__row--total"),
      summaryRow("Descuento", `${U.formatMoney(p.discountCents / 100)} (${p.discountPct}%)`, p.valid ? "" : "summary__row--neg"));
    if (!p.valid) {
      box.append(h("div", { class: "summary__row summary__row--neg" }, h("span", { text: p.totalCents >= p.listCents ? `El combo debe costar menos que ${U.formatMoney(p.listCents / 100)}.` : "Escribe un precio mayor que 0." })));
      return;
    }
    if (p.debtCents !== null) {
      box.append(summaryRow("Debes a BoomArt", U.formatMoney(p.debtCents / 100)),
        summaryRow("Tu ganancia", U.formatMoney(p.gainCents / 100), p.gainCents < 0 ? "summary__row--neg" : ""));
    }
  }

  async function submitCombo(event) {
    event.preventDefault();
    if (busy) return;
    const submit = $("combo-submit");
    const error = $("combo-error");
    error.hidden = true;
    const pending = pendingSale();
    let body;
    if (pending && pending.route === "/combos") {
      body = pending.body;            // se reintenta EXACTAMENTE el mismo combo (mismo id)
    } else {
      const card = selectedComboCard();
      const qty = card ? U.parseQty($("combo-qty").value, Number(card.available_qty)) : null;
      const total = U.parseMoney($("combo-price").value);
      const saved = card ? savedPrice(card) : null;
      if (!card) return fail("Elige un producto.");
      if (saved === null) return fail("Primero guarda tu precio de venta de este producto en la pestaña Productos.");
      if (qty === null || qty < 2) return fail(`La cantidad debe ser un número entre 2 y ${card.available_qty}.`);
      if (total === null || Number(total) <= 0) return fail("Escribe el precio total del combo, por ejemplo 35 o 35.50.");
      if (U.toCents(total) >= qty * U.toCents(saved)) return fail(`El combo debe costar menos que ${U.formatMoney((qty * U.toCents(saved)) / 100)} (${qty} × tu precio de venta).`);
      body = { id: comboDraft.id, product_id: card.product_id, qty, total_price: total };
      const day = $("combo-date").value;
      if ($("combo-date").dataset.touched && day && day !== U.localDay(new Date(), 0)) body.sold_on = day;
      writeJson(PENDING_KEY, { userId: state.user.id, route: "/combos", body, at: Date.now() });
    }
    setBusy(submit, true, "Registrando…");
    try {
      const result = await callPortal("/combos", body);
      writeJson(PENDING_KEY, null);
      $("dlg-combo").close();
      await refresh(true);
      showDone(result, body);
    } catch (err) {
      if (!isUncertain(err)) { writeJson(PENDING_KEY, null); comboDraft = { id: U.newId() }; }
      if (err.status === 401) { $("dlg-combo").close(); return handleExpired(); }
      fail(U.friendlyError(err));
      renderPendingBanner();
    } finally {
      setBusy(submit, false, "Confirmar combo");
      updateComboSummary();
    }
    function fail(message) { error.textContent = message; error.hidden = false; }
  }

  async function retryPending() {
    const pending = pendingSale();
    if (!pending || busy) return;
    busy = true;
    try {
      const result = await callPortal(pending.route || "/sales", pending.body);
      writeJson(PENDING_KEY, null);
      if (pending.savePrice === true) await saveSalePrice(pending.body);
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
    const combo = Boolean(result.combo_id);
    lastDone = result;
    $("dlg-done-title").textContent = result.result === "repetido" ? (combo ? "Ese combo ya estaba registrado" : "Esa venta ya estaba registrada") : (combo ? "Combo registrado" : "Venta registrada");
    $("done-body").replaceChildren(...(combo ? comboSummaryRows(result, name) : saleSummaryRows(result, name)));
    $("done-undo-note").textContent = combo
      ? "Si te equivocaste, puedes deshacer el combo durante 15 minutos (aquí o en el Historial)."
      : "Si te equivocaste, puedes deshacerla durante 15 minutos (aquí o en el Historial).";
    $("done-undo").hidden = result.result === "repetido";
    $("dlg-done").showModal();
  }

  async function undoSale(sale) {
    if (busy) return;
    if (!window.confirm(`¿Deshacer ${sale.isCombo ? "el combo" : "la venta"} de ${sale.qty} × ${sale.product_name}? Las unidades vuelven a tu stock.`)) return;
    busy = true;
    try {
      const result = await callPortal("/sales/void", { sale_id: sale.sale_id });
      toast(result.result === "repetido" ? "Esa venta ya estaba deshecha." : `${sale.isCombo ? "Combo deshecho" : "Venta deshecha"}. Las unidades volvieron a tu stock.`);
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
    $("adjust-sale").textContent = `${sale.isCombo ? "Combo: " : ""}${sale.qty} × ${sale.product_name} · ${U.formatMoney(sale.total_public)} · ${U.formatDateTime(sale.created_at)}`;
    for (const radio of document.querySelectorAll("input[name='adjust-kind']")) {
      const label = radio.closest("label");
      if (label) label.hidden = sale.isCombo === true && radio.value !== "anular";      // un combo solo se pide anular completo
    }
    $("adjust-anular-text").textContent = sale.isCombo ? "Anular el combo completo" : "Anular la venta completa";
    $("adjust-combo-note").hidden = sale.isCombo !== true;
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
    U.setPasswordVisible($("login-pass"), $("login-eye"), false);       // al enviar, la clave vuelve a ocultarse
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
    state.priceDrafts = {}; state.cards = []; state.history = []; state.pendingAssignments = []; state.deliveries = []; state.settlements = []; state.settlementLines = []; state.summary = null;
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
  $("login-eye").addEventListener("click", () => {
    const pass = $("login-pass");
    U.setPasswordVisible(pass, $("login-eye"), pass.type === "password");
  });
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
  $("combo-form").addEventListener("submit", submitCombo);
  $("combo-product").addEventListener("change", onComboProductChange);
  $("combo-qty").addEventListener("input", updateComboSummary);
  $("combo-qty").addEventListener("blur", () => { clampComboQty(); updateComboSummary(); });
  $("combo-price").addEventListener("input", updateComboSummary);
  $("combo-date").addEventListener("change", () => { $("combo-date").dataset.touched = "1"; });
  $("combo-minus").addEventListener("click", () => { const q = U.parseQty($("combo-qty").value) || 2; $("combo-qty").value = String(Math.max(2, q - 1)); updateComboSummary(); });
  $("combo-plus").addEventListener("click", () => {
    const card = selectedComboCard();
    const max = card ? Number(card.available_qty) : 2;
    const q = U.parseQty($("combo-qty").value) || 1;
    $("combo-qty").value = String(Math.min(max, q + 1));
    updateComboSummary();
  });
  $("combo-cancel").addEventListener("click", () => $("dlg-combo").close());
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
      toast(result.result === "repetido" ? "Esa venta ya estaba deshecha." : `${lastDone.combo_id ? "Combo deshecho" : "Venta deshecha"}. Las unidades volvieron a tu stock.`);
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
