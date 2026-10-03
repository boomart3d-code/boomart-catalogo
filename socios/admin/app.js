(function () {
  "use strict";

  const C = window.SOCIOS_PORTAL;
  const U = window.SociosUtil;
  const sb = window.supabase.createClient(C.apiUrl, C.publishableKey, {
    db: { schema: "socios" },
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  const ADMIN_URL = C.apiUrl.replace(/\/$/, "") + "/functions/v1/socios-admin";
  const IDLE_MS = 8 * 60 * 60 * 1000;
  const REFRESH_MS = 60 * 1000;
  const ACTIVE_KEY = "socios_admin_last_active_v1";
  const $ = (id) => document.getElementById(id);
  const state = { staff: null, partners: [], stock: [], sales: [], adjustments: [], settlements: [], settlementLines: [],
    settlementPreviews: [], settlementAdjustments: [], tab: "inicio", resolve: null, settlementDraft: null, collectDraft: null,
    settlementAdjustmentDraft: null, loadedAt: 0 };

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (key === "class") el.className = value;
      else if (key === "text") el.textContent = value;
      else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
      else if (value !== null && value !== undefined) el.setAttribute(key, value);
    }
    for (const child of children.flat(Infinity)) if (child) el.append(child);
    return el;
  }

  function show(view) {
    $("view-login").hidden = view !== "login";
    $("view-app").hidden = view !== "app";
  }

  function toast(message, kind) {
    const node = h("div", { class: `toast${kind ? ` toast--${kind}` : ""}`, text: message });
    $("toasts").append(node);
    window.setTimeout(() => node.remove(), 4500);
  }

  function readJson(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } }
  function writeJson(key, value) { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* sigue sin almacenamiento */ } }
  function touchActivity() {
    const now = Date.now();
    if (now - (touchActivity.last || 0) < 30000) return;
    touchActivity.last = now;
    writeJson(ACTIVE_KEY, now);
  }

  function normalize(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function selectedPartner() { return $("partner-filter").value; }
  function queryText() { return normalize($("search-filter").value.trim()); }
  function partnerName(id) { return state.partners.find((row) => row.partner_id === id)?.name || "Local"; }
  function matchesPartner(row) { return !selectedPartner() || row.partner_id === selectedPartner(); }
  function matchesText(...values) { const q = queryText(); return !q || values.some((value) => normalize(value).includes(q)); }
  function badge(text, kind) { return h("span", { class: `badge${kind ? ` badge--${kind}` : ""}`, text }); }
  function metric(value, label) { return h("div", { class: "metric" }, h("b", { text: String(value) }), h("span", { text: label })); }
  function sectionTitle(title, count) { return h("div", { class: "toolbar" }, h("h2", { text: title }), count === undefined ? null : h("span", { class: "counter", text: `${count} registro${count === 1 ? "" : "s"}` })); }

  async function callAdmin(route, body) {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw { status: 401 };
    let response;
    try {
      response = await fetch(ADMIN_URL + route, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "apikey": C.publishableKey },
        body: JSON.stringify(body)
      });
    } catch { throw { network: true }; }
    let payload = {};
    try { payload = await response.json(); } catch { /* respuesta invalida */ }
    if (!response.ok) throw { status: response.status, code: payload.error, detail: payload.detail };
    return payload;
  }

  async function loadData(quiet) {
    if (!quiet) toast("Actualizando información…");
    const results = await Promise.all([
      sb.from("v_admin_partners").select("*").order("name"),
      sb.from("v_admin_stock").select("*").order("partner_name").order("product_name"),
      sb.from("v_sales_history").select("*").order("created_at", { ascending: false }).limit(1000),
      sb.from("v_admin_adjustments").select("*").order("requested_at", { ascending: false }).limit(500),
      sb.from("v_settlements").select("*").order("opened_at", { ascending: false }).limit(500),
      sb.from("v_settlement_lines").select("*").order("sale_created_at", { ascending: false }).limit(2000),
      sb.from("v_settlement_previews").select("*").order("partner_name"),
      sb.from("v_settlement_adjustments").select("*").order("created_at", { ascending: false }).limit(500)
    ]);
    const failed = results.find((result) => result.error);
    if (failed) throw failed.error;
    [state.partners, state.stock, state.sales, state.adjustments, state.settlements, state.settlementLines,
      state.settlementPreviews, state.settlementAdjustments] = results.map((result) => result.data || []);
    state.loadedAt = Date.now();
    fillPartnerFilter();
    renderAll();
  }

  function fillPartnerFilter() {
    const previous = selectedPartner();
    $("partner-filter").replaceChildren(h("option", { value: "", text: "Todos los locales" }),
      ...state.partners.map((row) => h("option", { value: row.partner_id, text: row.name })));
    if (state.partners.some((row) => row.partner_id === previous)) $("partner-filter").value = previous;
  }

  function renderHome() {
    const root = $("tab-inicio");
    const partners = state.partners.filter(matchesPartner);
    const stock = state.stock.filter(matchesPartner);
    const pending = state.adjustments.filter((row) => row.status === "solicitada" && matchesPartner(row));
    const totals = partners.reduce((sum, row) => ({
      available: sum.available + Number(row.available_qty || 0), sold: sum.sold + Number(row.sold_qty_pending || 0),
      debt: sum.debt + Number(row.boomart_debt_pending || 0), public: sum.public + Number(row.public_total_pending || 0)
    }), { available: 0, sold: 0, debt: 0, public: 0 });
    const alerts = [];
    for (const row of pending) alerts.push({ red: true, title: `${row.partner_name}: corrección pendiente`, detail: `${row.product_name} · ${adjustmentLabel(row)}` });
    for (const row of stock.filter((item) => Number(item.available_qty) === 0)) alerts.push({ red: true, title: `${row.partner_name}: ${row.product_name} agotado`, detail: `SKU ${row.sku}` });
    for (const row of stock.filter((item) => Number(item.available_qty) > 0 && Number(item.idle_days) >= 30)) {
      alerts.push({ red: Number(row.idle_days) >= 90, title: `${row.partner_name}: ${row.product_name} lleva ${row.idle_days} días sin vender`, detail: `Disponibles: ${row.available_qty} · SKU ${row.sku}` });
    }
    const dueDays = { semanal: 7, quincenal: 15, mensual: 30 };
    for (const row of state.settlementPreviews.filter(matchesPartner)) {
      const threshold = dueDays[row.settlement_frequency];
      if (!threshold || !row.oldest_pending_on || row.active_settlement_id) continue;
      const age = Math.floor((Date.now() - new Date(`${row.oldest_pending_on}T00:00:00`).getTime()) / 86400000);
      if (age >= threshold) alerts.push({ red: age >= threshold * 2, title: `${row.partner_name}: cuadre pendiente`,
        detail: `${age} días desde la venta pendiente más antigua · frecuencia ${row.settlement_frequency}` });
    }
    root.replaceChildren(
      sectionTitle("Resumen en tiempo real"),
      h("div", { class: "cards" },
        h("div", { class: "stat" }, h("div", { class: "stat__label", text: "Unidades disponibles" }), h("div", { class: "stat__value", text: totals.available })),
        h("div", { class: "stat" }, h("div", { class: "stat__label", text: "Vendidas por cuadrar" }), h("div", { class: "stat__value", text: totals.sold })),
        h("div", { class: "stat" }, h("div", { class: "stat__label", text: "Deben a BoomArt" }), h("div", { class: "stat__value stat__value--gold", text: U.formatMoney(totals.debt) })),
        h("div", { class: "stat" }, h("div", { class: "stat__label", text: "Venta pública pendiente" }), h("div", { class: "stat__value", text: U.formatMoney(totals.public) }))
      ),
      sectionTitle("Alertas", alerts.length),
      alerts.length ? h("div", { class: "alert-list" }, alerts.slice(0, 50).map((item) => h("div", { class: `alert-card${item.red ? " alert-card--red" : ""}` }, h("div", { class: "admin-row__title", text: item.title }), h("div", { class: "admin-row__meta", text: item.detail }))))
        : h("p", { class: "empty empty--compact", text: "No hay correcciones pendientes, productos agotados ni productos con 30 días sin venta." })
    );
  }

  function renderPartners() {
    const rows = state.partners.filter((row) => matchesPartner(row) && matchesText(row.name));
    $("tab-locales").replaceChildren(sectionTitle("Locales", rows.length), rows.length ? h("div", { class: "admin-grid" }, rows.map((row) =>
      h("article", { class: "admin-row" },
        h("div", { class: "admin-row__head" }, h("div", { class: "admin-row__title", text: row.name }), row.active ? badge("Activo", "ok") : badge("Inactivo", "off")),
        h("div", { class: "admin-row__meta", text: `${row.settlement_frequency || "Frecuencia sin definir"}${row.last_sale_at ? ` · última venta ${U.formatDateTime(row.last_sale_at)}` : " · sin ventas"}` }),
        h("div", { class: "admin-row__metrics" }, metric(row.available_qty, "disponibles"), metric(row.sold_qty_pending, "por cuadrar"), metric(U.formatMoney(row.boomart_debt_pending), "debe")),
        Number(row.pending_adjustments) ? h("div", { class: "badges" }, badge(`${row.pending_adjustments} corrección pendiente`, "red")) : null
      ))) : h("p", { class: "empty", text: "No hay locales que coincidan con el filtro." }));
  }

  function renderStock() {
    const rows = state.stock.filter((row) => matchesPartner(row) && matchesText(row.partner_name, row.product_name, row.sku));
    $("tab-inventario").replaceChildren(sectionTitle("Inventario por local", rows.length), rows.length ? h("div", { class: "admin-list" }, rows.map((row) =>
      h("article", { class: "admin-row" },
        h("div", { class: "admin-row__head" }, h("div", {}, h("div", { class: "admin-row__title", text: row.product_name }), h("div", { class: "admin-row__meta", text: `${row.partner_name} · SKU ${row.sku}` })), h("div", { class: "badges" }, Number(row.available_qty) === 0 ? badge("Agotado", "red") : badge(`${row.available_qty} disponibles`, "ok"), Number(row.idle_days) >= 30 ? badge(`${row.idle_days} días`, Number(row.idle_days) >= 90 ? "red" : "warn") : null)),
        h("div", { class: "admin-row__metrics" }, metric(row.delivered_qty, "recibidas"), metric(row.sold_qty, "vendidas"), metric(row.available_qty, "disponibles"))
      ))) : h("p", { class: "empty", text: "No hay productos que coincidan con el filtro." }));
  }

  function renderSales() {
    const rows = state.sales.filter((row) => matchesPartner(row) && matchesText(partnerName(row.partner_id), row.product_name, row.sku));
    $("tab-ventas").replaceChildren(sectionTitle("Ventas reportadas", rows.length), rows.length ? h("div", { class: "admin-list" }, rows.map((row) =>
      h("article", { class: `admin-row${row.status === "anulada" ? " item--void" : ""}` },
        h("div", { class: "admin-row__head" }, h("div", {}, h("div", { class: "admin-row__title", text: `${row.qty} × ${row.product_name}` }), h("div", { class: "admin-row__meta", text: `${partnerName(row.partner_id)} · ${U.formatDateTime(row.created_at)} · SKU ${row.sku}` })), h("div", { class: "admin-row__amount", text: U.formatMoney(row.total_public) })),
        h("div", { class: "admin-row__meta", text: `Debe a BoomArt ${U.formatMoney(row.total_boomart)} · ganancia del local ${U.formatMoney(row.gain)}` }),
        h("div", { class: "badges" }, row.status === "anulada" ? badge("Anulada", "off") : badge("Registrada", "ok"), row.settlement_id ? badge("En cuadre", "ok") : badge("Por cuadrar", "warn"), row.adjustment_status === "solicitada" ? badge("Corrección pendiente", "red") : null)
      ))) : h("p", { class: "empty", text: "No hay ventas que coincidan con el filtro." }));
  }

  function adjustmentLabel(row) {
    if (row.kind === "anular") return "Anular la venta";
    if (row.kind === "corregir_cantidad") return `Cambiar cantidad de ${row.sale_qty} a ${row.new_qty}`;
    return `Cambiar precio de ${U.formatMoney(row.sale_price)} a ${U.formatMoney(row.new_price)}`;
  }

  function renderAdjustments() {
    const rows = state.adjustments.filter((row) => matchesPartner(row) && matchesText(row.partner_name, row.product_name, row.sku, row.reason));
    rows.sort((a, b) => Number(a.status !== "solicitada") - Number(b.status !== "solicitada") || String(b.requested_at).localeCompare(String(a.requested_at)));
    $("tab-correcciones").replaceChildren(sectionTitle("Solicitudes de corrección", rows.length), rows.length ? h("div", { class: "admin-list" }, rows.map((row) => {
      const pending = row.status === "solicitada";
      const canApprove = pending && row.sale_status === "registrada" && !row.sale_settled;
      return h("article", { class: "admin-row" },
        h("div", { class: "admin-row__head" }, h("div", {}, h("div", { class: "admin-row__title", text: `${row.partner_name} · ${row.product_name}` }), h("div", { class: "admin-row__meta", text: U.formatDateTime(row.requested_at) })), badge(row.status === "solicitada" ? "Pendiente" : row.status === "aprobada" ? "Aprobada" : "Rechazada", row.status === "solicitada" ? "warn" : row.status === "aprobada" ? "ok" : "red")),
        h("div", { text: adjustmentLabel(row) }),
        h("div", { class: "admin-row__meta", text: `Motivo del local: ${row.reason}` }),
        row.sale_settled ? h("div", { class: "badges" }, badge("La venta ya está en un cuadre: solo se puede rechazar", "red")) : null,
        row.resolution_note ? h("div", { class: "admin-row__meta", text: `Respuesta de BoomArt: ${row.resolution_note}` }) : null,
        pending && state.staff?.role === "admin" ? h("div", { class: "item__actions" },
          h("button", { class: "btn btn--primary btn--small", type: "button", disabled: canApprove ? null : "disabled", onclick: () => openResolve(row, "aprobar"), text: "Aprobar" }),
          h("button", { class: "btn btn--ghost btn--small", type: "button", onclick: () => openResolve(row, "rechazar"), text: "Rechazar" })) : null
      );
    })) : h("p", { class: "empty", text: "No hay solicitudes que coincidan con el filtro." }));
  }

  function settlementStatus(status) {
    return ({ abierta: "Abierta", en_revision: "En revisión", cuadrada: "Cuadrada", cobrada: "Cobrada", importada: "Importada", anulada: "Anulada" })[status] || status;
  }

  function paymentLabel(method) {
    return ({ efectivo: "Efectivo", yape: "Yape", plin: "Plin", transferencia_bcp: "Transferencia BCP",
      transferencia_interbank: "Transferencia Interbank", tarjeta: "Tarjeta", otro: "Otro" })[method] || method || "";
  }

  function renderSettlements() {
    const previews = state.settlementPreviews.filter(matchesPartner);
    const history = state.settlements.filter((row) => matchesPartner(row)
      && matchesText(row.partner_name, row.settlement_number, settlementStatus(row.status), row.payment_reference));
    const root = $("tab-liquidaciones");
    const pendingCards = previews.filter((row) => row.active_settlement_id || Number(row.sale_count_pending) || Number(row.adjustment_count_pending));
    root.replaceChildren(
      sectionTitle("Preparar y cerrar cuadres", pendingCards.length),
      pendingCards.length ? h("div", { class: "admin-list" }, pendingCards.map((preview) => {
        const current = preview.active_settlement_id ? state.settlements.find((row) => row.settlement_id === preview.active_settlement_id) : null;
        const pendingBoomart = Number(preview.boomart_pending || 0) + Number(preview.boomart_adjustment_pending || 0);
        const pendingPublic = Number(preview.public_pending || 0) + Number(preview.public_adjustment_pending || 0);
        const actions = [];
        if (state.staff?.role === "admin") {
          if (!current) actions.push(h("button", { class: "btn btn--primary btn--small", type: "button", onclick: () => openSettlement(preview), text: "Crear cuadre" }));
          else if (current.status === "abierta") actions.push(h("button", { class: "btn btn--primary btn--small", type: "button", onclick: () => transitionSettlement(current, "review"), text: "Pasar a revisión" }));
          else if (current.status === "en_revision") actions.push(h("button", { class: "btn btn--primary btn--small", type: "button", onclick: () => transitionSettlement(current, "square"), text: "Cuadrar y congelar" }));
          if (current) actions.push(h("button", { class: "btn btn--ghost btn--small", type: "button", onclick: () => openCancelSettlement(current), text: "Anular cuadre" }));
          actions.push(h("button", { class: "btn btn--ghost btn--small", type: "button", onclick: () => openSettlementAdjustment(preview), text: "Agregar ajuste" }));
        }
        return h("article", { class: "admin-row" },
          h("div", { class: "admin-row__head" }, h("div", {}, h("div", { class: "admin-row__title", text: preview.partner_name }),
            h("div", { class: "admin-row__meta", text: current ? `${current.settlement_number} · ${settlementStatus(current.status)} · ${U.formatDay(current.period_start)} a ${U.formatDay(current.period_end)}` : "Sin cuadre activo" })),
            current ? badge(settlementStatus(current.status), current.status === "en_revision" ? "warn" : "ok") : badge("Pendiente", "warn")),
          h("div", { class: "admin-row__metrics" }, metric(preview.qty_pending, "unidades"), metric(U.formatMoney(pendingBoomart), "deuda"), metric(U.formatMoney(pendingPublic - pendingBoomart), "ganancia local")),
          Number(preview.adjustment_count_pending) ? h("div", { class: "badges" }, badge(`${preview.adjustment_count_pending} ajuste pendiente`, "warn")) : null,
          h("div", { class: "settlement-actions" }, actions));
      })) : h("p", { class: "empty empty--compact", text: "No hay ventas ni ajustes pendientes de cuadre." }),
      sectionTitle("Historial de liquidaciones", history.length),
      history.length ? h("div", { class: "admin-list" }, history.map((row) => {
        const lines = state.settlementLines.filter((line) => line.settlement_id === row.settlement_id);
        const actions = [];
        if (state.staff?.role === "admin" && row.status === "cuadrada") {
          actions.push(h("button", { class: "btn btn--primary btn--small", type: "button", onclick: () => openCollect(row), text: "Marcar cobrada" }));
        }
        return h("article", { class: "admin-row" },
          h("div", { class: "admin-row__head" }, h("div", {}, h("div", { class: "admin-row__title", text: `${row.settlement_number} · ${row.partner_name}` }),
            h("div", { class: "admin-row__meta", text: `${U.formatDay(row.period_start)} a ${U.formatDay(row.period_end)}` })),
            badge(settlementStatus(row.status), row.status === "cobrada" || row.status === "importada" ? "ok" : row.status === "en_revision" ? "warn" : "off")),
          // abierta / en revision / anulada no tienen importes congelados: mostrar ceros haria creer que el cuadre vale S/ 0.00
          ["abierta", "en_revision", "anulada"].includes(row.status)
            ? h("div", { class: "admin-row__meta", text: row.status === "anulada" ? `Anulada el ${U.formatDateTime(row.cancelled_at)}` : "Los importes se calculan y se congelan al cuadrar (arriba ves la vista previa)." })
            : h("div", { class: "admin-row__metrics" }, metric(row.total_qty, "unidades"), metric(U.formatMoney(row.total_boomart), "BoomArt"), metric(U.formatMoney(row.total_partner_gain), "ganancia local")),
          row.status === "cobrada" || row.status === "importada" ? h("div", { class: "admin-row__meta", text: `Cobrado ${U.formatDay(row.paid_on)} · ${paymentLabel(row.payment_method)}${row.payment_reference ? ` · ${row.payment_reference}` : ""}` }) : null,
          lines.length ? h("div", { class: "settlement-lines" }, lines.slice(0, 20).map((line) => h("div", { class: "settlement-line" },
            h("span", { text: `${line.qty} × ${line.product_name}` }), h("span", { text: `BoomArt ${U.formatMoney(line.total_boomart)}` })))) : null,
          h("div", { class: "settlement-actions" }, actions));
      })) : h("p", { class: "empty", text: "Todavía no hay liquidaciones." })
    );
  }

  function renderAll() { renderHome(); renderPartners(); renderStock(); renderSales(); renderAdjustments(); renderSettlements(); }

  function showTab(tab) {
    state.tab = tab;
    for (const section of document.querySelectorAll(".tab")) section.hidden = section.id !== `tab-${tab}`;
    for (const button of document.querySelectorAll(".tabbar__btn")) button.classList.toggle("is-active", button.dataset.tab === tab);
  }

  function openResolve(row, decision) {
    state.resolve = row;
    document.querySelector(`input[name='decision'][value='${decision}']`).checked = true;
    $("resolve-summary").replaceChildren(h("div", { class: "summary__row" }, h("span", { text: row.partner_name }), h("b", { text: row.product_name })), h("div", { text: adjustmentLabel(row) }), h("div", { class: "muted", text: `Motivo: ${row.reason}` }));
    $("resolve-note").value = "";
    $("resolve-error").hidden = true;
    updateResolveHint();
    $("dlg-resolve").showModal();
  }

  function updateResolveHint() {
    const decision = document.querySelector("input[name='decision']:checked").value;
    $("resolve-hint").textContent = decision === "rechazar" ? "Obligatoria al rechazar (mínimo 3 caracteres)." : "Opcional al aprobar.";
  }

  async function submitResolve(event) {
    event.preventDefault();
    if (!state.resolve) return;
    const decision = document.querySelector("input[name='decision']:checked").value;
    const note = $("resolve-note").value.trim();
    const error = $("resolve-error");
    if (decision === "rechazar" && note.length < 3) { error.textContent = "Escribe el motivo del rechazo."; error.hidden = false; return; }
    const submit = $("resolve-submit");
    submit.disabled = true;
    try {
      await callAdmin("/adjustments/resolve", { adjustment_id: state.resolve.adjustment_id, decision, note });
      $("dlg-resolve").close();
      state.resolve = null;
      toast(decision === "aprobar" ? "Corrección aprobada." : "Corrección rechazada.");
      await loadData(true);
    } catch (err) {
      if (err.status === 401) return handleExpired();
      error.textContent = U.friendlyError(err); error.hidden = false;
    } finally { submit.disabled = false; }
  }

  function openSettlement(preview) {
    state.settlementDraft = { id: U.newId(), preview };
    const today = U.localDay(new Date(), 0);
    $("settlement-partner").textContent = `${preview.partner_name} · ${preview.qty_pending} unidades pendientes`;
    $("settlement-start").value = preview.oldest_pending_on || today;
    $("settlement-end").value = today;
    $("settlement-note").value = "";
    $("settlement-error").hidden = true;
    $("dlg-settlement").showModal();
  }

  async function submitSettlement(event) {
    event.preventDefault();
    if (!state.settlementDraft) return;
    const error = $("settlement-error");
    error.hidden = true;
    const start = $("settlement-start").value;
    const end = $("settlement-end").value;
    if (!start || !end || start > end) { error.textContent = "Revisa las fechas del periodo."; error.hidden = false; return; }
    const button = $("settlement-submit"); button.disabled = true;
    try {
      await callAdmin("/settlements/create", { id: state.settlementDraft.id, partner_id: state.settlementDraft.preview.partner_id,
        period_start: start, period_end: end, note: $("settlement-note").value.trim() });
      $("dlg-settlement").close(); state.settlementDraft = null;
      toast("Cuadre creado. Revísalo antes de congelar las ventas."); await loadData(true);
    } catch (err) {
      if (err.status === 401) return handleExpired();
      error.textContent = U.friendlyError(err); error.hidden = false;
    } finally { button.disabled = false; }
  }

  async function transitionSettlement(row, action) {
    const square = action === "square";
    const message = square
      ? `¿Cuadrar ${row.settlement_number}? Las ventas e importes quedarán congelados y cualquier corrección posterior irá al siguiente cuadre.`
      : `¿Pasar ${row.settlement_number} a revisión? Se fijará el corte; las ventas nuevas posteriores quedarán para el siguiente cuadre.`;
    if (!window.confirm(message)) return;
    try {
      await callAdmin(square ? "/settlements/square" : "/settlements/review", { settlement_id: row.settlement_id });
      toast(square ? "Liquidación cuadrada y congelada." : "Corte de revisión fijado."); await loadData(true);
    } catch (err) {
      if (err.status === 401) return handleExpired();
      toast(U.friendlyError(err), "error");
    }
  }

  function openCollect(row) {
    state.collectDraft = row;
    $("collect-summary").replaceChildren(h("div", { class: "summary__row" }, h("span", { text: row.settlement_number }), h("b", { text: row.partner_name })),
      h("div", { class: "summary__row" }, h("span", { text: "Monto para BoomArt" }), h("b", { text: U.formatMoney(row.total_boomart) })));
    $("collect-method").value = "yape";
    $("collect-date").value = U.localDay(new Date(), 0);
    $("collect-reference").value = "";
    $("collect-error").hidden = true;
    $("dlg-collect").showModal();
  }

  async function submitCollect(event) {
    event.preventDefault();
    if (!state.collectDraft) return;
    const error = $("collect-error"); error.hidden = true;
    if (!$("collect-date").value) { error.textContent = "Elige la fecha de cobro."; error.hidden = false; return; }
    const button = $("collect-submit"); button.disabled = true;
    try {
      await callAdmin("/settlements/collect", { settlement_id: state.collectDraft.settlement_id,
        payment_method: $("collect-method").value, paid_on: $("collect-date").value,
        payment_reference: $("collect-reference").value.trim() });
      $("dlg-collect").close(); state.collectDraft = null;
      toast("Cobro registrado. Queda pendiente de importar a Studio en la Etapa 7."); await loadData(true);
    } catch (err) {
      if (err.status === 401) return handleExpired();
      error.textContent = U.friendlyError(err); error.hidden = false;
    } finally { button.disabled = false; }
  }

  function parseSignedMoney(text) {
    const clean = String(text || "").trim().replace(",", ".");
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(clean)) return null;
    const value = Number(clean);
    return Number.isFinite(value) && Math.abs(value) <= 1000000 ? value : null;
  }

  function openSettlementAdjustment(preview) {
    state.settlementAdjustmentDraft = { id: U.newId(), preview };
    $("settlement-adjust-partner").textContent = preview.partner_name;
    const rows = state.settlements.filter((row) => row.partner_id === preview.partner_id && ["cuadrada", "cobrada", "importada"].includes(row.status));
    $("settlement-adjust-source").replaceChildren(h("option", { value: "", text: "Sin liquidación de origen" }),
      ...rows.map((row) => h("option", { value: row.settlement_id, text: `${row.settlement_number} · ${settlementStatus(row.status)}` })));
    $("settlement-adjust-public").value = "0.00";
    $("settlement-adjust-boomart").value = "0.00";
    $("settlement-adjust-reason").value = "";
    $("settlement-adjust-error").hidden = true;
    $("dlg-settlement-adjust").showModal();
  }

  async function submitSettlementAdjustment(event) {
    event.preventDefault();
    if (!state.settlementAdjustmentDraft) return;
    const error = $("settlement-adjust-error"); error.hidden = true;
    const publicDelta = parseSignedMoney($("settlement-adjust-public").value);
    const boomartDelta = parseSignedMoney($("settlement-adjust-boomart").value);
    const reason = $("settlement-adjust-reason").value.trim();
    if (publicDelta === null || boomartDelta === null || (publicDelta === 0 && boomartDelta === 0)) {
      error.textContent = "Escribe al menos un ajuste distinto de cero, con hasta dos decimales."; error.hidden = false; return;
    }
    if (reason.length < 5) { error.textContent = "Explica el motivo (mínimo 5 caracteres)."; error.hidden = false; return; }
    const source = $("settlement-adjust-source").value;
    const body = { id: state.settlementAdjustmentDraft.id, partner_id: state.settlementAdjustmentDraft.preview.partner_id,
      public_delta: publicDelta, boomart_delta: boomartDelta, reason };
    if (source) body.source_settlement_id = source;
    const button = $("settlement-adjust-submit"); button.disabled = true;
    try {
      await callAdmin("/settlements/adjustments/create", body);
      $("dlg-settlement-adjust").close(); state.settlementAdjustmentDraft = null;
      toast("Ajuste guardado para el próximo cuadre."); await loadData(true);
    } catch (err) {
      if (err.status === 401) return handleExpired();
      error.textContent = U.friendlyError(err); error.hidden = false;
    } finally { button.disabled = false; }
  }

  function openCancelSettlement(row) {
    state.cancelDraft = row;
    $("cancel-settlement-summary").textContent = `${row.settlement_number} · ${row.partner_name} · ${settlementStatus(row.status)}`;
    $("cancel-settlement-reason").value = "";
    $("cancel-settlement-error").hidden = true;
    $("dlg-cancel-settlement").showModal();
  }

  async function submitCancelSettlement(event) {
    event.preventDefault();
    if (!state.cancelDraft) return;
    const error = $("cancel-settlement-error"); error.hidden = true;
    const reason = $("cancel-settlement-reason").value.trim();
    if (reason.length < 5) { error.textContent = "Explica el motivo (mínimo 5 caracteres)."; error.hidden = false; return; }
    const button = $("cancel-settlement-submit"); button.disabled = true;
    try {
      await callAdmin("/settlements/cancel", { settlement_id: state.cancelDraft.settlement_id, reason });
      $("dlg-cancel-settlement").close(); state.cancelDraft = null;
      toast("Cuadre anulado. Ya puedes crear otro para ese local."); await loadData(true);
    } catch (err) {
      if (err.status === 401) return handleExpired();
      error.textContent = U.friendlyError(err); error.hidden = false;
    } finally { button.disabled = false; }
  }

  async function handleExpired() {
    await sb.auth.signOut();
    state.staff = null;
    show("login");
    $("login-error").textContent = "Tu sesión venció. Entra de nuevo.";
    $("login-error").hidden = false;
  }

  async function acceptSession(session) {
    if (!session?.user) { show("login"); return; }
    const { data, error } = await sb.from("staff").select("login_name, role, status").eq("user_id", session.user.id).maybeSingle();
    if (error || !data || data.status !== "activo" || !["admin", "lectura"].includes(data.role)) {
      await sb.auth.signOut();
      show("login");
      $("login-error").textContent = "Esta cuenta no tiene acceso a la administración de BoomArt.";
      $("login-error").hidden = false;
      return;
    }
    state.staff = data;
    touchActivity();
    $("staff-name").textContent = `${data.login_name || "BoomArt"} · ${data.role === "admin" ? "Administrador" : "Solo lectura"}`;
    show("app");
    try { await loadData(true); } catch { toast("No se pudo cargar la información. Intenta actualizar.", "error"); }
  }

  async function onLogin(event) {
    event.preventDefault();
    const error = $("login-error");
    error.hidden = true;
    const email = U.loginEmail($("login-user").value, C.loginDomain);
    if (!email) { error.textContent = "Escribe un usuario válido."; error.hidden = false; return; }
    const submit = $("login-submit"); submit.disabled = true;
    const result = await sb.auth.signInWithPassword({ email, password: $("login-pass").value });
    submit.disabled = false;
    if (result.error) { error.textContent = "Usuario o clave incorrectos."; error.hidden = false; return; }
    $("login-pass").value = "";
    await acceptSession(result.data.session);
  }

  async function logout() { writeJson(ACTIVE_KEY, null); await sb.auth.signOut(); state.staff = null; show("login"); }

  async function boot() {
    const lastActive = readJson(ACTIVE_KEY);
    const { data } = await sb.auth.getSession();
    if (data.session && lastActive && Date.now() - lastActive > IDLE_MS) {
      await sb.auth.signOut({ scope: "local" }).catch(() => {});
      show("login");
      $("login-error").textContent = "Por seguridad cerramos tu sesión después de un rato sin uso. Entra de nuevo.";
      $("login-error").hidden = false;
      return;
    }
    await acceptSession(data.session);
  }

  $("login-form").addEventListener("submit", onLogin);
  $("btn-logout").addEventListener("click", logout);
  $("btn-refresh").addEventListener("click", () => loadData(false).catch(() => toast("No se pudo actualizar.", "error")));
  $("partner-filter").addEventListener("change", renderAll);
  $("search-filter").addEventListener("input", renderAll);
  for (const button of document.querySelectorAll(".tabbar__btn")) button.addEventListener("click", () => showTab(button.dataset.tab));
  $("resolve-form").addEventListener("submit", submitResolve);
  $("resolve-cancel").addEventListener("click", () => $("dlg-resolve").close());
  for (const radio of document.querySelectorAll("input[name='decision']")) radio.addEventListener("change", updateResolveHint);
  $("settlement-form").addEventListener("submit", submitSettlement);
  $("settlement-cancel").addEventListener("click", () => $("dlg-settlement").close());
  $("collect-form").addEventListener("submit", submitCollect);
  $("collect-cancel").addEventListener("click", () => $("dlg-collect").close());
  $("settlement-adjust-form").addEventListener("submit", submitSettlementAdjustment);
  $("settlement-adjust-cancel").addEventListener("click", () => $("dlg-settlement-adjust").close());
  $("cancel-settlement-form").addEventListener("submit", submitCancelSettlement);
  $("cancel-settlement-cancel").addEventListener("click", () => $("dlg-cancel-settlement").close());
  window.addEventListener("online", () => { $("offline-banner").hidden = true; if (state.staff) loadData(true).catch(() => {}); });
  window.addEventListener("offline", () => { $("offline-banner").hidden = false; });
  for (const name of ["pointerdown", "keydown"]) window.addEventListener(name, touchActivity, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.staff && Date.now() - state.loadedAt > REFRESH_MS) loadData(true).catch(() => {});
  });
  window.setInterval(() => {
    if (!state.staff) return;
    const lastActive = readJson(ACTIVE_KEY);
    if (lastActive && Date.now() - lastActive > IDLE_MS) handleExpired();
    else if (document.visibilityState === "visible" && Date.now() - state.loadedAt > REFRESH_MS) loadData(true).catch(() => {});
  }, REFRESH_MS);

  boot().catch(() => { show("login"); $("login-error").textContent = "No se pudo iniciar el panel. Recarga la página."; $("login-error").hidden = false; });
})();
