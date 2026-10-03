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
  const state = { staff: null, partners: [], stock: [], sales: [], adjustments: [], tab: "inicio", resolve: null, loadedAt: 0 };

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
      sb.from("v_admin_adjustments").select("*").order("requested_at", { ascending: false }).limit(500)
    ]);
    const failed = results.find((result) => result.error);
    if (failed) throw failed.error;
    [state.partners, state.stock, state.sales, state.adjustments] = results.map((result) => result.data || []);
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

  function renderAll() { renderHome(); renderPartners(); renderStock(); renderSales(); renderAdjustments(); }

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
