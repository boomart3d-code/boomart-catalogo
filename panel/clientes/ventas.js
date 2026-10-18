// Ventas de BoomArt Studio en el portal (pedido de Adrián, 2026-10-17).
// Studio sube un resumen de cada venta a la nube (tabla ventas_studio); aquí solo se LEE:
//  * Pestaña «Ventas»: un mes a la vez (el actual por defecto), más recientes arriba, de 20 en 20.
//  * En cada tarjeta de cliente: su venta más reciente en Studio (por WhatsApp o documento).
// La venta se registra y se corrige siempre en Studio. Única excepción (2026-10-17): el botón
// «FINALIZAR (ya pagó + ya se envió)» deja un CIERRE PENDIENTE que Studio aplica al abrirse
// (registra el saldo, finaliza y envía solo la nota final por correo); aquí solo se arma el WhatsApp.
// Script clásico (no módulo) cargado ANTES de app.js para no perder el aviso «boomart:records».
(function () {
"use strict";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = n => new Intl.NumberFormat("es-PE", {style:"currency", currency:"PEN"}).format(Number(n || 0));
const fmtDate = x => {
  const d = x ? new Date(x) : null;
  return d && !isNaN(d) ? new Intl.DateTimeFormat("es-PE", {dateStyle:"medium", timeStyle:"short", timeZone:"America/Lima"}).format(d) : "—";
};
// Fecha de abono de Studio: «2026-10-17 16:57:00» o solo «2026-10-17» (hora de Lima).
const fmtAbono = f => {
  const t = String(f || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, d] = t.split("-").map(Number);
    return new Intl.DateTimeFormat("es-PE", {dateStyle:"medium", timeZone:"UTC"}).format(new Date(Date.UTC(y, m - 1, d, 12)));
  }
  return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(t) ? fmtDate(t.replace(" ", "T").slice(0, 19) + "-05:00") : (t || "—");
};
const limaMonth = () => new Intl.DateTimeFormat("en-CA", {timeZone:"America/Lima", year:"numeric", month:"2-digit"}).format(new Date()).slice(0, 7);
const monthName = m => {
  const [y, mo] = m.split("-").map(Number);
  const t = new Intl.DateTimeFormat("es-PE", {month:"long", year:"numeric", timeZone:"UTC"}).format(new Date(Date.UTC(y, mo - 1, 15)));
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const originPill = v => v.origen === "web"
  ? `<span class="pill web">Venta web${v.pedido_web ? ` · ${esc(v.pedido_web)}` : ""}</span>`
  : `<span class="pill direct">Venta directa (Studio)</span>`;
const PAGE = 20;

let client = null;
let state = {mes: limaMonth(), filtro: "todas", buscar: "", offset: 0, loading: false};
let generation = 0;
const rowsByNv = new Map();
let ajustes = null;

// ---------------------------------------------------------------- pestañas
function buildTabs() {
  const portal = $("#portal");
  if (!portal || $("#tabVentas")) return;
  const clientes = document.createElement("div");
  clientes.id = "tabClientes";
  while (portal.firstChild) clientes.appendChild(portal.firstChild);
  const nav = document.createElement("nav");
  nav.className = "tabs";
  nav.innerHTML = `<button type="button" data-tab="clientes" class="active">Clientes</button><button type="button" data-tab="ventas">Ventas</button>`;
  const ventas = document.createElement("div");
  ventas.id = "tabVentas";
  ventas.hidden = true;
  ventas.innerHTML = `
    <div class="summary">
      <div><b id="vCount">0</b><small>Ventas del mes</small></div>
      <div><b id="vTotal">S/ 0</b><small>Total vendido</small></div>
      <div><b id="vPaid">S/ 0</b><small>Abonado</small></div>
      <div><b id="vDue">S/ 0</b><small>Saldo por cobrar</small></div>
    </div>
    <p id="vSplit" class="vSplit"></p>
    <div class="filters vFilters">
      <select id="vMes" aria-label="Mes"></select>
      <input id="vBuscar" placeholder="NV-00114, nombre, teléfono o DNI…" autocomplete="off">
      <button id="vRefresh" type="button">Actualizar</button>
    </div>
    <div class="chips" role="group" aria-label="Filtrar ventas">
      <button type="button" data-f="todas" class="active">Todas</button>
      <button type="button" data-f="web">Web</button>
      <button type="button" data-f="directa">Directas</button>
      <button type="button" data-f="saldo">Con saldo</button>
    </div>
    <p id="vState"></p>
    <div id="vList"></div>
    <button id="vMore" type="button" hidden>Ver más ventas</button>
    <dialog id="vDialog"><div id="vDialogBody"></div></dialog>`;
  portal.append(nav, clientes, ventas);
  nav.addEventListener("click", e => {
    const b = e.target.closest("[data-tab]");
    if (b) showTab(b.dataset.tab);
  });
  $("#vMes").addEventListener("change", () => { state.mes = $("#vMes").value; reload(); });
  let timer;
  $("#vBuscar").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { state.buscar = $("#vBuscar").value.trim(); reload(); }, 350); });
  $("#vRefresh").addEventListener("click", () => { loadMonths(); reload(); });
  ventas.querySelector(".chips").addEventListener("click", e => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    ventas.querySelectorAll(".chips button").forEach(x => x.classList.toggle("active", x === b));
    state.filtro = b.dataset.f;
    reload();
  });
  $("#vMore").addEventListener("click", () => load(false));
  $("#vList").addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const v = rowsByNv.get(b.dataset.nv);
    if (!v) return;
    if (b.dataset.act === "cerrar") openClose(v);
    if (b.dataset.act === "mensaje") openMessage(v);
    if (b.dataset.act === "anular") cancelClose(v, b);
  });
}

function showTab(tab) {
  document.querySelectorAll(".tabs [data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  $("#tabClientes").hidden = tab !== "clientes";
  $("#tabVentas").hidden = tab !== "ventas";
  if (tab === "ventas" && client && !$("#vList").dataset.loaded) { loadMonths(); reload(); }
}

// ---------------------------------------------------------------- pestaña Ventas
async function loadMonths() {
  const sel = $("#vMes");
  const r = await client.rpc("ventas_studio_meses");
  const months = new Set([limaMonth(), state.mes, ...((r.data || []).map(x => x.mes))]);
  const counts = Object.fromEntries((r.data || []).map(x => [x.mes, x.ventas]));
  sel.innerHTML = [...months].sort().reverse().map(m =>
    `<option value="${m}"${m === state.mes ? " selected" : ""}>${esc(monthName(m))}${counts[m] ? ` · ${counts[m]}` : ""}</option>`).join("");
}

async function loadSummary() {
  const r = await client.rpc("ventas_studio_resumen_mes", {p_mes: state.mes});
  const s = (r.data && r.data[0]) || {ventas:0, total:0, abonado:0, saldo:0, web:0, directas:0};
  $("#vCount").textContent = s.ventas;
  $("#vTotal").textContent = money(s.total);
  $("#vPaid").textContent = money(s.abonado);
  $("#vDue").textContent = money(s.saldo);
  $("#vSplit").textContent = `${monthName(state.mes)}: ${s.web} venta(s) web · ${s.directas} directa(s) en Studio`;
}

function saleActions(v) {
  const nv = esc(v.nv);
  if (v.cierre) {
    const c = v.cierre;
    return `<div class="closeInfo"><b>✔ Cerrada desde el celular</b> · ${esc(c.medio)}${c.cuenta ? ` (${esc(c.cuenta)})` : ""}
      · falta que Studio la registre (al abrir la laptop registra el pago y envía la nota por correo).</div>
      <div class="actions"><button type="button" class="waBtn" data-act="mensaje" data-nv="${nv}">Mensaje WhatsApp</button>
      <button type="button" class="danger" data-act="anular" data-nv="${nv}">Anular cierre</button></div>`;
  }
  // Ventas antiguas: «Pedido entregado y pagado» sin sello de finalizada (anteriores a ese sello).
  if (v.finalizada || (v.estado === "Pedido entregado y pagado" && Number(v.saldo || 0) <= 0.009)) return "";
  return `<div class="actions"><button type="button" class="finalBtn" data-act="cerrar" data-nv="${nv}">FINALIZAR (ya pagó + ya se envió)</button></div>`;
}

function saleCard(v) {
  rowsByNv.set(v.nv, v);
  const productos = (v.productos || []).map(p =>
    `<li>${esc(p.cantidad)} × ${esc(p.nombre)} <span>${money(p.subtotal)}</span></li>`).join("");
  const abonos = (v.abonos || []).map(a =>
    `<li>${esc(fmtAbono(a.fecha))} · ${money(a.monto)} · ${esc(a.medio || "")}${a.nota ? ` · ${esc(a.nota)}` : ""}</li>`).join("");
  const saldo = Number(v.saldo || 0) > 0.009;
  return `<article class="record sale" data-nv="${esc(v.nv)}">
    <div class="recordTop"><div>
      <h2><span class="code">${esc(v.nv)}</span> · ${esc(v.cliente_nombre || "Sin nombre")}</h2>
      ${originPill(v)}<span class="pill">${esc(v.estado || "—")}</span>
      ${v.cierre ? `<span class="pill ok">Cerrada desde el celular</span>`
        : saldo ? `<span class="pill due">Saldo ${money(v.saldo)}</span>` : `<span class="pill ok">Pagado</span>`}
    </div><time>Vendida<br>${fmtDate(v.vendido_en)}</time></div>
    <div class="details">
      <div><small>Total</small><span>${money(v.total)}</span></div>
      <div><small>Abonado</small><span>${money(v.abonado)}</span></div>
      <div><small>Saldo</small><span>${money(v.saldo)}</span></div>
      <div><small>WhatsApp</small><span>${esc(v.cliente_telefono || "—")}</span></div>
      <div><small>Entrega</small><span>${esc(v.entrega || "—")}</span></div>
      <div><small>Fecha prometida</small><span>${esc(v.fecha_prometida || "—")}</span></div>
    </div>
    <ul class="saleItems">${productos}</ul>
    ${abonos ? `<details class="saleAbonos"><summary>Abonos (${(v.abonos || []).length})</summary><ul>${abonos}</ul></details>` : ""}
    ${saleActions(v)}
  </article>`;
}

function reload() {
  generation += 1;
  state.loading = false;
  state.offset = 0;
  $("#vList").innerHTML = "";
  $("#vList").dataset.loaded = "1";
  loadSummary().catch(() => {});
  return load(true);
}

async function load(first) {
  if (state.loading && !first) return;
  const mine = generation;
  state.loading = true;
  $("#vState").textContent = "Cargando ventas…";
  try {
    const r = await client.rpc("ventas_studio_mes", {p_mes: state.mes, p_filtro: state.filtro, p_buscar: state.buscar,
      p_offset: state.offset, p_limit: PAGE});
    if (mine !== generation) return;  // llegó tarde: ya se pidió otra lista
    if (r.error) throw r.error;
    const rows = r.data || [];
    $("#vList").insertAdjacentHTML("beforeend", rows.map(saleCard).join(""));
    state.offset += rows.length;
    $("#vMore").hidden = rows.length < PAGE;
    const shown = $("#vList").children.length;
    $("#vState").textContent = shown
      ? `${shown} venta(s)${state.buscar ? ` para «${state.buscar}»` : ` de ${monthName(state.mes)}`} · más recientes primero`
      : (first ? "No hay ventas con estos filtros." : "");
  } catch (err) {
    $("#vState").textContent = "No se pudieron cargar las ventas. Pulsa «Actualizar».";
  } finally {
    if (mine === generation) state.loading = false;
  }
}

// ---------------------------------------------------------------- cierre desde el celular
const isShalom = v => /shalom|provincia/i.test(v.entrega || "");
const limaToday = () => new Intl.DateTimeFormat("en-CA", {timeZone:"America/Lima"}).format(new Date());
const firstName = n => { const w = String(n || "").trim().split(/\s+/)[0] || ""; return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""; };
const hasEmail = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v.cliente_correo || "").trim());

function orderSummary(v) {
  const names = [];
  (v.productos || []).forEach(p => { const n = String(p.nombre || "").trim(); if (n && !names.includes(n)) names.push(n); });
  if (!names.length) return "Pedido BoomArt";
  return names.length <= 3 ? names.join(" / ") : names.slice(0, 3).join(" / ") + ` / +${names.length - 3} más`;
}

function whatsappMessage(v) {
  const name = firstName(v.cliente_nombre);
  const parts = [
    `¡Hola${name ? " " + name : ""}! 🙌 Muchas gracias por tu compra en BoomArt.`,
    `🧾 Pedido: ${orderSummary(v)}\n💰 Total: ${money(v.total)}\n✅ Pagado: ${money(v.total)} (pago completo)`,
  ];
  if (isShalom(v)) parts.push("📦 Tu pedido ya fue enviado por Shalom. Puedes seguirlo en la página de Shalom con el código QR del voucher que te enviamos.");
  if (hasEmail(v)) parts.push("📩 En breve te llegará a tu correo la nota de venta final en PDF.");
  parts.push(`⭐ ¿Nos ayudas con una reseña? Nos ayuda muchísimo:\n${(ajustes && ajustes.resenas) || "https://boomart.pe/opinion"}`);
  parts.push("¡Gracias por confiar en BoomArt!");
  return parts.join("\n\n");
}

function waNumber(v) {
  const tel = String(v.cliente_telefono || "").replace(/\D/g, "");
  const pais = String(v.cliente_pais || "51").replace(/\D/g, "") || "51";
  if (!tel) return "";
  if (pais === "51" && tel.length === 9) return "51" + tel;
  return tel.startsWith(pais) && tel.length > 9 ? tel : pais + tel;
}

async function loadAjustes() {
  if (ajustes) return ajustes;
  const r = await client.rpc("ventas_studio_ajustes_portal");
  ajustes = (!r.error && r.data) || {};
  return ajustes;
}

function dialog(html) {
  $("#vDialogBody").innerHTML = html;
  const d = $("#vDialog");
  if (!d.open) d.showModal();
  d.querySelectorAll("[data-close]").forEach(b => b.onclick = () => d.close());
  return d;
}

function refreshCard(v) {
  const old = document.querySelector(`#vList article[data-nv="${CSS.escape(v.nv)}"]`);
  if (old) old.outerHTML = saleCard(v);
}

async function openClose(v) {
  const a = await loadAjustes();
  const medios = (a.medios && a.medios.length) ? a.medios : ["Yape", "Plin", "Transferencia BCP", "Transferencia IBK", "Efectivo"];
  const cuentas = a.cuentas || [];
  const map = a.medio_cuenta || {};
  const pick = medios.includes(v.medio_pago) ? v.medio_pago : medios[0];
  const saldo = Number(v.saldo || 0);
  const opt = (list, sel) => list.map(x => `<option${x === sel ? " selected" : ""}>${esc(x)}</option>`).join("");
  dialog(`
    <h2>Finalizar ${esc(v.nv)}</h2>
    <p class="dlgWho">${esc(v.cliente_nombre || "Sin nombre")} · ${esc(orderSummary(v))}</p>
    <p>${saldo > 0.009 ? `Se registrará el saldo de <b>${money(saldo)}</b> como pagado.` : "No hay saldo pendiente."}<br>
      ${isShalom(v) ? "Envío Shalom: se cierra tu gestión (no se marca entregado)." : "Se marcará como enviado y entregado."}</p>
    <div class="dlgFields">
      <label>Medio de pago del saldo<select id="cMedio">${opt(medios, pick)}</select></label>
      <label>Cuenta que recibe<select id="cCuenta"><option value="">(la de ese medio)</option>${opt(cuentas, map[pick] || "")}</select></label>
      <label>Fecha<input id="cFecha" type="date" value="${limaToday()}" max="${limaToday()}"></label>
    </div>
    <p class="dlgNote">Studio lo registrará al abrir la laptop y enviará solo el correo con la nota final.</p>
    <p id="cMsg" class="dlgMsg"></p>
    <div class="actions"><button type="button" id="cGo" class="finalBtn">Confirmar cierre</button><button type="button" data-close>Cancelar</button></div>`);
  $("#cMedio").onchange = () => { const c = map[$("#cMedio").value] || ""; $("#cCuenta").value = cuentas.includes(c) ? c : ""; };
  $("#cGo").onclick = async () => {
    const go = $("#cGo");
    go.disabled = true;
    $("#cMsg").textContent = "Guardando…";
    const r = await client.rpc("ventas_studio_cerrar", {p_nv: v.nv, p_medio: $("#cMedio").value,
      p_cuenta: $("#cCuenta").value, p_fecha: $("#cFecha").value || limaToday()});
    if (r.error) {
      go.disabled = false;
      $("#cMsg").textContent = (r.error.message || "No se pudo guardar.") + " Intenta otra vez.";
      return;
    }
    v.cierre = {medio: $("#cMedio").value, cuenta: $("#cCuenta").value, fecha: $("#cFecha").value, creado_en: new Date().toISOString()};
    refreshCard(v);
    openMessage(v);
  };
}

function openMessage(v) {
  loadAjustes().then(() => {
    const msg = whatsappMessage(v);
    const num = waNumber(v);
    const waHref = text => `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
    dialog(`
      <h2>Mensaje para ${esc(firstName(v.cliente_nombre) || "el cliente")}</h2>
      <p>${v.cierre ? "Cierre guardado. " : ""}Envíale este mensaje por WhatsApp:</p>
      <textarea id="mText" rows="14">${esc(msg)}</textarea>
      <p id="mMsg" class="dlgMsg"></p>
      <div class="actions">
        <button type="button" id="mCopy">Copiar</button>
        ${num ? `<a class="waLink" target="_blank" rel="noopener" href="${waHref(msg)}">Abrir WhatsApp</a>` : ""}
        <button type="button" data-close>Cerrar</button>
      </div>`);
    $("#mText").oninput = () => { const a = document.querySelector(".waLink"); if (a) a.href = waHref($("#mText").value); };
    $("#mCopy").onclick = async () => {
      try { await navigator.clipboard.writeText($("#mText").value); }
      catch { $("#mText").select(); document.execCommand("copy"); }
      $("#mMsg").textContent = "Copiado ✔";
    };
  });
}

async function cancelClose(v, btn) {
  if (!confirm(`¿Anular el cierre de ${v.nv}? Studio no lo registrará.`)) return;
  btn.disabled = true;
  const r = await client.rpc("ventas_studio_cierre_anular", {p_nv: v.nv});
  if (r.error || r.data !== true) {
    btn.disabled = false;
    alert(r.error ? "No se pudo anular. Intenta otra vez." : "Studio ya lo registró: corrígelo desde Studio.");
    return;
  }
  v.cierre = null;
  refreshCard(v);
}

// ---------------------------------------------------------------- línea en cada tarjeta de cliente
async function decorate(rows) {
  const cards = [...document.querySelectorAll("#list article.record")];
  if (!rows.length || cards.length !== rows.length) return;
  const r = await client.rpc("ventas_studio_de_registros", {p_submissions: rows.map(x => x.id)});
  if (r.error) return;
  const bySub = Object.fromEntries((r.data || []).map(x => [x.submission_id, x]));
  rows.forEach((row, i) => {
    const card = cards[i];
    card.querySelector(".studioLine")?.remove();
    const v = bySub[row.id];
    const line = document.createElement("div");
    line.className = "studioLine";
    if (v) {
      const saldo = Number(v.saldo || 0) > 0.009;
      line.innerHTML = `<b>En Studio:</b> <span class="code">${esc(v.nv)}</span> · ${money(v.total)} · abonado ${money(v.abonado)}`
        + `${saldo ? ` · <span class="dueText">saldo ${money(v.saldo)}</span>` : " · pagado"} · ${esc(v.estado || "")} ${originPill(v)}`
        + `${v.ventas > 1 ? ` <span class="pill">${v.ventas} ventas</span>` : ""}`
        + ` <button type="button" class="linkBtn" data-ver="${esc(String(row.phone || "").replace(/\D/g, "") || row.document_number || v.nv)}">Ver sus ventas</button>`;
    } else if (row.status === "imported") {
      line.innerHTML = `<b>En Studio:</b> cliente creado · aún sin ventas`;
    } else {
      return;
    }
    const details = card.querySelector(".details");
    (details || card).insertAdjacentElement("afterend", line);
  });
  document.querySelectorAll("#list [data-ver]").forEach(b => b.onclick = () => {
    $("#vBuscar").value = b.dataset.ver;
    state.buscar = b.dataset.ver;
    state.filtro = "todas";
    document.querySelectorAll("#tabVentas .chips button").forEach(x => x.classList.toggle("active", x.dataset.f === "todas"));
    $("#vList").dataset.loaded = "";
    showTab("ventas");
  });
}

window.addEventListener("boomart:records", e => {
  client = e.detail && e.detail.client;
  if (!client) return;
  buildTabs();
  // Esperar a que la bandeja dibuje las tarjetas antes de agregarles la línea.
  setTimeout(() => decorate(e.detail.rows || []).catch(() => {}), 0);
});
})();
