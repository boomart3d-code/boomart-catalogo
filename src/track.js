/*
 * Medicion propia de boomart.pe (anonima). Registra que hace la gente en la
 * web -- visitas, producto visto, carrito, clics a WhatsApp, tiempo activo --
 * y lo manda a la Edge Function `track` (Supabase) para el panel privado, y
 * en paralelo a Google Analytics (gtag) con los nombres estandar de GA4.
 *
 * PRIVACIDAD: no guarda nombre, correo, telefono ni IP. Solo dos codigos
 * aleatorios en el navegador (vid = visitante, sid = sesion de 30 min).
 *
 * NO afecta a la tienda: si esto falla o esta bloqueado, el catalogo, el
 * carrito y WhatsApp siguen igual (todo va dentro de try/catch).
 *
 * USO desde otros scripts (siempre opcional):
 *   window.BoomartTrack && BoomartTrack.event("agregar_carrito", { p: id, c: 2, v: 120 });
 *   claves: p=producto, b=boton, o=origen, v=valor S/, c=cantidad, d={extra}
 *
 * Utilidades: ?excluir=1 en cualquier URL deja de contar ESE dispositivo
 * (?excluir=0 lo revierte). localStorage.boomart_debug = "1" imprime los
 * eventos en la consola sin enviarlos (util en local).
 */
(function () {
  "use strict";

  const ENDPOINT = "https://sasqusmvysbvqiggdmuj.supabase.co/functions/v1/track";
  const PROD_HOSTS = { "boomart.pe": 1, "www.boomart.pe": 1 };
  const K_VID = "boomart_vid";
  const K_SES = "boomart_ses";
  const K_EXC = "boomart_excluir";
  const K_DBG = "boomart_debug";
  const SESSION_MS = 30 * 60 * 1000; // inactividad que cierra la sesion
  const IDLE_MS = 30 * 1000; // sin interaccion = el tiempo deja de contar
  const TIME_MARKS = [10, 20, 30, 45, 60, 90, 120, 180, 300, 480, 600, 900];
  const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

  const noop = { enabled: false, event() {} };

  const lsGet = (k) => {
    try { return window.localStorage.getItem(k); } catch (e) { return null; }
  };
  const lsSet = (k, v) => {
    try { window.localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ }
  };
  const lsDel = (k) => {
    try { window.localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ }
  };

  try {
    // ?excluir=1 -> este dispositivo deja de contar (para Adrian y su equipo).
    const ex = new URLSearchParams(window.location.search).get("excluir");
    if (ex === "1") lsSet(K_EXC, "1");
    else if (ex === "0") lsDel(K_EXC);
  } catch (e) { /* URL rara: se ignora */ }

  const isProd = Boolean(PROD_HOSTS[window.location.hostname]);
  const debug = lsGet(K_DBG) === "1";
  if (lsGet(K_EXC) === "1" || navigator.webdriver || (!isProd && !debug)) {
    window.BoomartTrack = noop;
    return;
  }

  const rid = (bytes) => {
    const a = new Uint8Array(bytes);
    try {
      window.crypto.getRandomValues(a);
    } catch (e) {
      for (let i = 0; i < bytes; i += 1) a[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  };

  const clean = (v) => {
    const t = String(v == null ? "" : v).trim().toLowerCase();
    return t ? t.slice(0, 60) : "";
  };

  // ---------- De donde llego (primer contacto de la sesion) ----------
  const classifyReferrer = (host) => {
    if (/(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|copilot\.microsoft\.com|gemini\.google\.com)$/.test(host)) return ["ia", host];
    if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(host)) return ["facebook", "referido"];
    if (/(^|\.)instagram\.com$/.test(host)) return ["instagram", "referido"];
    if (/(^|\.)(wa\.me|whatsapp\.com)$/.test(host)) return ["whatsapp", "referido"];
    if (/(^|\.)google\.[a-z.]+$/.test(host)) return ["google", "organico"];
    if (/(^|\.)(bing\.com|duckduckgo\.com|yahoo\.com|ecosia\.org)$/.test(host)) return [host.split(".").slice(-2, -1)[0], "organico"];
    if (/(^|\.)tiktok\.com$/.test(host)) return ["tiktok", "referido"];
    return [host, "referido"];
  };

  const attribution = () => {
    const p = new URLSearchParams(window.location.search);
    const utmSource = clean(p.get("utm_source"));
    const utmMedium = clean(p.get("utm_medium"));
    const utmCampaign = clean(p.get("utm_campaign"));
    const src = clean(p.get("src"));
    let refHost = "";
    try {
      refHost = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "").toLowerCase() : "";
    } catch (e) { refHost = ""; }
    if (refHost === window.location.hostname.replace(/^www\./, "")) refHost = "";

    let fu = "";
    let me = "";
    let ca = utmCampaign;
    if (utmSource) { fu = utmSource; me = utmMedium || "enlace"; }
    else if (src) { fu = src; me = "enlace"; }
    else if (p.get("fbclid")) { fu = "meta"; me = "anuncio"; }
    else if (p.get("gclid")) { fu = "google"; me = "anuncio"; }
    else if (p.get("ttclid")) { fu = "tiktok"; me = "anuncio"; }
    else if (refHost) { [fu, me] = classifyReferrer(refHost); }
    else { fu = "directo"; me = "ninguno"; ca = ""; }

    const cat = clean(p.get("categoria"));
    const prod = clean(p.get("producto"));
    const partes = [];
    if (cat) partes.push(`categoria=${cat}`);
    if (prod) partes.push(`producto=${prod}`);
    const land = (window.location.pathname + (partes.length ? `?${partes.join("&")}` : "")).slice(0, 160);
    return { fu, me, ca, ref: refHost.slice(0, 80), land };
  };

  // ---------- Visitante y sesion ----------
  const startedAt = Date.now();
  let vid = lsGet(K_VID);
  let vidIsNew = false;
  if (!vid || !ID_RE.test(vid)) {
    vid = rid(16);
    lsSet(K_VID, vid);
    vidIsNew = true;
  }

  let ses = null;
  try { ses = JSON.parse(lsGet(K_SES) || "null"); } catch (e) { ses = null; }
  if (!ses || !ID_RE.test(String(ses.id || "")) || startedAt - (ses.ts || 0) > SESSION_MS) {
    ses = Object.assign({ id: rid(12), ts: startedAt, nuevo: vidIsNew }, attribution());
  }
  let lastTouch = 0;
  const touch = () => {
    const t = Date.now();
    if (t - lastTouch < 5000) return;
    lastTouch = t;
    ses.ts = t;
    lsSet(K_SES, JSON.stringify(ses));
  };
  touch();

  const pv = rid(6);
  const pagePath = window.location.pathname;
  const device = (() => {
    let coarse = false;
    try { coarse = window.matchMedia("(pointer: coarse)").matches; } catch (e) { coarse = false; }
    if (!coarse) return "pc";
    return window.innerWidth < 768 ? "movil" : "tablet";
  })();
  let tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { tz = ""; }

  // ---------- Interaccion humana, tiempo activo y scroll ----------
  let human = false;
  let lastInteraction = 0;
  let maxScroll = 0;
  let activeSec = 0;
  let lastSentSec = 0;
  let markIdx = 0;

  const onInteract = (e) => {
    if (e && e.isTrusted === false) return;
    human = true;
    lastInteraction = Date.now();
    touch();
  };
  ["pointerdown", "touchstart", "keydown", "wheel"].forEach((n) =>
    window.addEventListener(n, onInteract, { passive: true, capture: true }));
  let lastMove = 0;
  window.addEventListener("mousemove", (e) => {
    const t = Date.now();
    if (t - lastMove < 1000) return;
    lastMove = t;
    onInteract(e);
  }, { passive: true });
  window.addEventListener("scroll", (e) => {
    onInteract(e);
    const h = document.documentElement.scrollHeight - window.innerHeight;
    if (h > 0) {
      const pct = Math.round(((window.scrollY || window.pageYOffset) / h) * 100);
      if (pct > maxScroll) maxScroll = Math.min(100, pct);
    }
  }, { passive: true });

  // ---------- Cola de eventos y envio ----------
  const queue = [];
  let timer = null;

  const envelope = (evs) => ({
    vid,
    sid: ses.id,
    host: window.location.hostname,
    pag: pagePath.slice(0, 160),
    land: ses.land,
    fu: ses.fu,
    me: ses.me,
    ca: ses.ca,
    ref: ses.ref,
    dev: device,
    tz,
    lang: (navigator.language || "").slice(0, 20),
    hum: human,
    nuevo: Boolean(ses.nuevo),
    evs,
  });

  const post = (body) => {
    if (!isProd) {
      try { console.debug("[track]", JSON.parse(body)); } catch (e) { /* nada */ }
      return;
    }
    let ok = false;
    try {
      if (navigator.sendBeacon) {
        ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain;charset=UTF-8" }));
      }
    } catch (e) { ok = false; }
    if (!ok) {
      try {
        fetch(ENDPOINT, {
          method: "POST",
          body,
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          keepalive: true,
        }).catch(() => {});
      } catch (e) { /* sin red: se pierde este lote, no pasa nada */ }
    }
  };

  const flush = () => {
    clearTimeout(timer);
    timer = null;
    while (queue.length) post(JSON.stringify(envelope(queue.splice(0, 20))));
  };

  // Nombres de Google Analytics (GA4) para los mismos eventos.
  const GA = {
    ver_producto: (e) => ["view_item", { items: [{ item_id: e.p }] }],
    agregar_carrito: (e) => ["add_to_cart", { currency: "PEN", value: e.v || 0, items: [{ item_id: e.p, quantity: e.c || 1 }] }],
    abrir_carrito: (e) => ["view_cart", { currency: "PEN", value: e.v || 0 }],
    iniciar_compra: (e) => ["begin_checkout", { currency: "PEN", value: e.v || 0 }],
    pedido_whatsapp: (e) => ["pedido_whatsapp", { currency: "PEN", value: e.v || 0 }],
    clic_whatsapp: (e) => ["whatsapp_click", { boton: e.b || "", item_id: e.p || "" }],
  };
  const mirrorToGA = (e) => {
    try {
      if (typeof window.gtag !== "function" || !GA[e.t]) return;
      const [name, params] = GA[e.t](e);
      window.gtag("event", name, params);
    } catch (err) { /* GA bloqueado: no importa */ }
  };

  const track = (name, props, immediate) => {
    try {
      const p = props || {};
      const e = { t: name, pv };
      if (p.p) e.p = String(p.p).slice(0, 80);
      if (p.b) e.b = String(p.b).slice(0, 30);
      if (p.o) e.o = String(p.o).slice(0, 30);
      if (p.v != null && Number.isFinite(Number(p.v))) e.v = Number(p.v);
      if (p.c != null && Number.isFinite(Number(p.c))) e.c = Number(p.c);
      if (p.s != null) e.s = p.s;
      if (p.sc != null) e.sc = p.sc;
      if (p.d && typeof p.d === "object") e.d = p.d;
      queue.push(e);
      mirrorToGA(e);
      touch();
      if (immediate || queue.length >= 15) flush();
      else if (!timer) timer = setTimeout(flush, 3000);
    } catch (err) { /* nunca romper la web por medir */ }
  };

  const sendTime = () => {
    if (activeSec > lastSentSec) {
      lastSentSec = activeSec;
      track("tiempo", { s: activeSec, sc: maxScroll });
    }
  };

  setInterval(() => {
    if (document.visibilityState === "visible" && Date.now() - lastInteraction < IDLE_MS) {
      activeSec += 1;
      if (markIdx < TIME_MARKS.length && activeSec >= TIME_MARKS[markIdx]) {
        markIdx += 1;
        sendTime();
      }
    }
  }, 1000);

  const onHide = () => {
    sendTime();
    flush();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onHide();
  });
  window.addEventListener("pagehide", onHide);

  // ---------- Clics a WhatsApp (cualquier boton/enlace de la web) ----------
  const WA_RE = /^(https?:\/\/)?(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|wa\.link)|^whatsapp:/i;
  const productFromPath = () => {
    try {
      const m = pagePath.match(/^\/producto\/([^/]+)\/?$/);
      return m ? decodeURIComponent(m[1]) : "";
    } catch (e) {
      return "";
    }
  };
  const buttonName = (a) => {
    if (a.closest(".ba-wa")) return "flotante";
    if (a.closest("#redes")) return "redes";
    if (a.id === "shareProductWa") return "ficha";
    if (a.id === "offersWhatsapp") return "ofertas";
    if (a.id === "footerWhatsapp" || a.closest("footer")) return "pie";
    if (a.closest(".pp-cta")) return "producto";
    if (a.closest(".pp-body")) return "producto_texto";
    if (a.closest(".cat-more")) return "categoria";
    if (a.closest("#personalizado")) return "medida";
    if (a.closest("header, nav")) return "menu";
    return "otro";
  };
  document.addEventListener("click", (event) => {
    try {
      const a = event.target && event.target.closest ? event.target.closest("a[href]") : null;
      if (!a || !WA_RE.test(a.getAttribute("href") || "")) return;
      track("clic_whatsapp", {
        b: buttonName(a),
        p: (a.dataset && a.dataset.product) || productFromPath(),
      }, true);
    } catch (err) { /* nada */ }
  }, true);

  window.BoomartTrack = { enabled: true, event: (name, props) => track(name, props, false), flush };

  // ---------- Eventos automaticos de la carga ----------
  track("visita", {}, false);
  const pathProduct = productFromPath();
  if (pathProduct) track("ver_producto", { p: pathProduct, o: "pagina" }, false);
})();
