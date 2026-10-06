/*
 * Utilidades puras del portal de socios (sin acceso al DOM ni a la red), para poder probarlas con Node:
 *   node portal/util.test.js
 * Todo lo que toca dinero se valida igual en el servidor; aqui solo se evita enviar basura y se explican los errores.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SociosUtil = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MAX_QTY = 10000;
  const MAX_PRICE = 100000;

  /** "12", "12.5", "12,50", " S/ 12.50 " -> "12.50"; devuelve null si no es un monto valido (0 a 100000, hasta 2 decimales). */
  function parseMoney(text) {
    if (typeof text !== "string") return null;
    // solo se quita el prefijo "S/" y los espacios de los extremos: "12 50" NO se lee como 1250
    const clean = text.trim().replace(/^s\/\.?\s*/i, "").trim().replace(",", ".");
    if (!/^[0-9]{1,6}(\.[0-9]{1,2})?$/.test(clean)) return null;
    const value = Number(clean);
    if (!(value >= 0 && value <= MAX_PRICE)) return null;
    const [whole, cents = ""] = clean.split(".");
    return `${Number(whole)}.${cents.padEnd(2, "0")}`;
  }

  /** "3" -> 3; null si no es un entero entre 1 y max. */
  function parseQty(text, max) {
    const limit = Math.min(max === undefined ? MAX_QTY : max, MAX_QTY);
    if (typeof text !== "string" || !/^[0-9]{1,5}$/.test(text.trim())) return null;
    const value = Number(text.trim());
    return value >= 1 && value <= limit ? value : null;
  }

  /** Total mostrado antes de confirmar (solo informativo; el servidor calcula el oficial). */
  function totalCents(qty, price) {
    const cents = Math.round(Number(price) * 100);
    return qty * cents;
  }

  function formatMoney(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "S/ 0.00";
    const sign = number < 0 ? "-" : "";
    const abs = Math.abs(number).toFixed(2);
    const [whole, cents] = abs.split(".");
    return `${sign}S/ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
  }

  /** "2026-10-03" -> "03/10/2026" sin pasar por zonas horarias. */
  function formatDay(isoDay) {
    const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(String(isoDay || ""));
    return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
  }

  function formatDateTime(iso, locale) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString(locale || "es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function countdown(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  /** Fecha local del navegador como AAAA-MM-DD (para el selector de fecha). */
  function localDay(date, offsetDays) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + (offsetDays || 0));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  /** Traduce un error de la funcion/Auth a un mensaje para una persona. `err`: {network}|{status, code, detail}. */
  function friendlyError(err) {
    if (!err) return "Algo salió mal. Intenta de nuevo.";
    if (err.network) return "No hay conexión con el portal. No se perdió nada: toca Confirmar de nuevo y no se duplicará.";
    const detail = typeof err.detail === "string" && err.detail ? err.detail : "";
    switch (err.status) {
      case 400: return detail ? capitalize(detail) : "Revisa los datos e intenta de nuevo.";
      case 401: return "Tu sesión venció. Entra de nuevo.";
      case 403: return "Esta cuenta no puede hacer esto. Avisa a BoomArt.";
      case 409:
        if (err.code === "stock") return capitalize(detail || "No hay suficientes unidades.");
        if (err.code === "window") return "Pasaron más de 15 minutos. Pide una corrección a BoomArt.";
        return capitalize(detail || "Esto ya cambió. Actualiza e intenta de nuevo.");
      case 413: return "El pedido es demasiado grande.";
      case 429: return "Demasiados intentos seguidos. Espera un minuto e intenta de nuevo.";
      case 503: return "El portal está en pausa por un momento. Intenta más tarde.";
      default: return "Algo salió mal de nuestro lado. Intenta de nuevo en un momento.";
    }
  }

  function capitalize(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) + (/[.!?]$/.test(text) ? "" : ".") : text;
  }

  /** La guia vigente para mostrar: la de mayor version entre las de tipo "guia". */
  function pickGuide(documents) {
    const guides = (documents || []).filter((d) => d && d.kind === "guia" && typeof d.storage_path === "string");
    guides.sort((a, b) => b.version - a.version);
    return guides[0] || null;
  }

  /** El usuario escribe el nombre; el correo tecnico lo arma el portal. Devuelve null si no tiene la forma valida. */
  function loginEmail(input, domain) {
    const login = String(input || "").trim().toLowerCase().split("@")[0];
    return /^[a-z0-9][a-z0-9._-]{2,39}$/.test(login) ? `${login}@${domain}` : null;
  }

  function newId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  /** 7.5 | "7.50" -> 750 (centavos enteros). */
  function toCents(value) {
    return Math.round(Number(value) * 100);
  }

  /** Deuda BoomArt exacta de `qty` unidades segun los lotes que quedan por vender (orden FIFO) [{qty, price}]: centavos, o null si no alcanzan. */
  function fifoCostCents(lots, qty) {
    let remaining = qty;
    let total = 0;
    for (const lot of Array.isArray(lots) ? lots : []) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(lot.qty));
      total += take * toCents(lot.price);
      remaining -= take;
    }
    return remaining > 0 ? null : total;
  }

  /** Vista previa de un combo (solo informativa; el servidor calcula el oficial). Todo en centavos; null si faltan datos. */
  function comboPreview(qty, pvp, total, lots) {
    if (!Number.isInteger(qty) || qty < 2 || pvp === null || pvp === undefined || total === null || total === undefined) return null;
    const list = qty * toCents(pvp);
    const price = toCents(total);
    const debt = fifoCostCents(lots, qty);
    return {
      listCents: list, totalCents: price, discountCents: list - price,
      discountPct: list > 0 ? Math.round(((list - price) / list) * 1000) / 10 : 0,
      valid: price > 0 && price < list,
      debtCents: debt, gainCents: debt === null ? null : price - debt,
    };
  }

  /** Une las filas de un mismo combo (por los centavos el servidor puede partirlo en 2 filas) en UNA sola entrada del historial. */
  function groupSales(rows) {
    const out = [];
    const combos = new Map();
    const rank = { solicitada: 3, aprobada: 2, rechazada: 1 };
    for (const row of rows || []) {
      if (!row.combo_id) { out.push({ ...row, isCombo: false }); continue; }
      let group = combos.get(row.combo_id);
      if (!group) {
        group = { ...row, sale_id: row.combo_id, isCombo: true, qty: 0, _total: 0, _boomart: 0, _list: 0, undo_seconds: 0, can_undo: false };
        combos.set(row.combo_id, group);
        out.push(group);
      }
      group.qty += Number(row.qty);
      group._total += toCents(row.total_public);
      group._boomart += toCents(row.total_boomart);
      group._list += Number(row.qty) * toCents(row.list_unit_price);
      group.can_undo = group.can_undo || row.can_undo === true;
      group.undo_seconds = Math.max(group.undo_seconds, Number(row.undo_seconds) || 0);
      if ((rank[row.adjustment_status] || 0) > (rank[group.adjustment_status] || 0)) {
        group.adjustment_status = row.adjustment_status;
        group.adjustment_kind = row.adjustment_kind;
        group.adjustment_note = row.adjustment_note;
      }
    }
    for (const group of combos.values()) {
      group.total_public = group._total / 100;
      group.total_boomart = group._boomart / 100;
      group.gain = (group._total - group._boomart) / 100;
      group.list_total = group._list / 100;
      group.discount = (group._list - group._total) / 100;
      group.public_unit_price = group.qty > 0 ? Math.round(group._total / group.qty) / 100 : 0;
      for (const key of ["_total", "_boomart", "_list"]) delete group[key];
    }
    return out;
  }

  // «Ojo» de la clave: alterna entre puntos y texto. Recibe el campo y el boton (cualquier objeto con esas propiedades; asi se prueba en Node).
  function setPasswordVisible(input, button, visible) {
    const show = visible === true;
    input.type = show ? "text" : "password";
    const label = show ? "Ocultar clave" : "Mostrar clave";
    button.setAttribute("aria-pressed", show ? "true" : "false");
    button.setAttribute("aria-label", label);
    button.title = label;
    return show;
  }

  return { MAX_QTY, MAX_PRICE, parseMoney, parseQty, totalCents, toCents, fifoCostCents, comboPreview, groupSales, formatMoney, formatDay, formatDateTime, countdown, localDay, friendlyError, pickGuide, loginEmail, newId, setPasswordVisible };
});
