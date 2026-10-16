/*
 * Registro de clientes dentro de boomart.pe (pedido de Adrián, 2026-10-15).
 *
 * Reemplaza al inicio de sesión por enlace mágico. El cliente se registra en una
 * ventana de la misma página — sin salir, sin confirmar el correo para poder
 * registrarse — con los MISMOS datos y la misma forma de pedirlos que
 * /registro-cliente/ (incluido el buscador inteligente de agencias Shalom).
 *
 *  - Obligatorios: nombre completo, WhatsApp, correo y documento. La entrega es
 *    opcional (en el checkout se pide solo elegir la opción; la dirección sigue
 *    siendo opcional).
 *  - Registro obligatorio para comprar: el paso 1 del checkout es este formulario.
 *  - Se usa también en "Reclama 10 %" y en "Mi cuenta".
 *  - Cupón 10 %: lo controla el servidor por documento (ligado al WhatsApp);
 *    aquí solo se refleja si está disponible.
 *  - El código de importación para Studio y los correos (bienvenida al cliente,
 *    aviso a BoomArt) los genera el servidor; el cliente nunca ve el código.
 *
 * Servidor: funciones registro_web_* de Supabase
 * (supabase/migrations/202610150001_registro_web.sql).
 */
(function () {
  "use strict";

  const config = window.BOOMART_SUPABASE;
  const lib = window.supabase;
  const sb = config && lib && typeof lib.createClient === "function"
    ? lib.createClient(config.url, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

  const TOKEN_KEY = "boomart_reg_token_v1";
  const CUSTOMER_KEY = "boomart_customer_v1";
  const DRAFT_KEY = "boomart_reg_draft_v1";
  const AGENCIES_URL = "registro-cliente/shalom-agencias.json";
  const PICKUP_TEXT = "Jr. E. García Calderón 127 Dpto. 302, San José - Bellavista, Callao. Atención únicamente previa coordinación por WhatsApp; no es una tienda abierta al público.";

  const storage = (() => {
    try {
      const k = "__boomart_reg_test__";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      return window.localStorage;
    } catch (err) {
      return null;
    }
  })();

  function readJson(key, fallback) {
    if (!storage) return fallback;
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }
  function writeJson(key, value) {
    if (!storage) return;
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch (err) {
      // sin almacenamiento: el registro funciona igual en esta visita
    }
  }

  // Token aleatorio del navegador: identifica este dispositivo ante el servidor
  // (que solo guarda su hash). Sin almacenamiento, vive solo en esta visita.
  let memoryToken = "";
  function token() {
    let t = "";
    try {
      t = storage ? storage.getItem(TOKEN_KEY) || "" : memoryToken;
    } catch (err) {
      t = memoryToken;
    }
    if (!/^[0-9a-f]{64}$/.test(t)) {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      t = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      memoryToken = t;
      try {
        if (storage) storage.setItem(TOKEN_KEY, t);
      } catch (err) {}
    }
    return t;
  }

  const esc = (value) =>
    String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const firstName = (full) => String(full || "").trim().split(/\s+/)[0] || "";

  const normalizePhone = (value) => {
    let d = String(value || "").replace(/\D/g, "");
    if (d.startsWith("0051") && d.length === 13) d = d.slice(4);
    else if (d.startsWith("51") && d.length === 11) d = d.slice(2);
    return d;
  };

  // ---------- Perfil del cliente en este navegador ----------

  let profile = null;
  let profileLoaded = false;
  const listeners = new Set();

  // Pasa el perfil al checkout y al carrito (misma llave que ya usan
  // checkout.js y cart.js): nombre, contacto, documento, entrega y cupón.
  function applyProfile(p) {
    profile = p || null;
    const current = readJson(CUSTOMER_KEY, {}) || {};
    if (p) {
      const d = deliveryFromProfile(p);
      writeJson(CUSTOMER_KEY, {
        ...current,
        registered: true,
        couponEligible: Boolean(p.cupon_disponible),
        name: p.full_name,
        lastName: "",
        phone: p.phone,
        email: p.email,
        docType: p.document_type,
        docNumber: p.document_number,
        destination: d.destination || current.destination || null,
        limaDistrict: d.limaDistrict,
        provDepartment: d.provDepartment,
        provProvince: d.provProvince,
        addressDetail: d.addressDetail
      });
    } else if (current.registered || current.couponEligible || current.isAccountCustomer) {
      // Sin registro en el servidor (o datos del sistema anterior de cuentas):
      // el cupón solo se refleja tras registrarse.
      writeJson(CUSTOMER_KEY, { ...current, registered: false, couponEligible: false, isAccountCustomer: false });
    }
    const label = document.querySelector("#accountLabel");
    if (label) label.textContent = p ? firstName(p.full_name) || "Mi cuenta" : "Mi cuenta";
    if (window.BoomartCart && typeof window.BoomartCart.refresh === "function") window.BoomartCart.refresh();
    listeners.forEach((fn) => {
      try {
        fn(profile);
      } catch (err) {}
    });
  }

  // Entrega del perfil traducida a lo que usa el checkout (destino Lima /
  // Provincias para las condiciones de entrega, y un texto legible).
  function deliveryFromProfile(p) {
    const m = (p && p.delivery_method) || "";
    if (m === "indriver") {
      return {
        method: m,
        destination: "lima",
        limaDistrict: p.local_district || "",
        provDepartment: "",
        provProvince: "",
        addressDetail: [p.local_address, p.local_reference].filter(Boolean).join(" · "),
        label: ["Envío local (InDrive)", p.local_district, p.local_address].filter(Boolean).join(" — ")
      };
    }
    if (m === "shalom") {
      return {
        method: m,
        destination: "provincias",
        limaDistrict: "",
        provDepartment: p.shalom_department || "",
        provProvince: p.shalom_province || "",
        addressDetail: [p.shalom_name, p.shalom_address].filter(Boolean).join(" · "),
        label: ["Shalom", p.shalom_name, [p.shalom_district, p.shalom_province, p.shalom_department].filter(Boolean).join(", ")]
          .filter(Boolean).join(" — ")
      };
    }
    if (m === "pickup") {
      return {
        method: m,
        destination: "lima",
        limaDistrict: "Bellavista (recojo)",
        provDepartment: "",
        provProvince: "",
        addressDetail: "",
        label: "Recojo coordinado con BoomArt (Bellavista, Callao)"
      };
    }
    return { method: "", destination: null, limaDistrict: "", provDepartment: "", provProvince: "", addressDetail: "", label: "" };
  }

  async function loadProfile() {
    if (!sb) {
      profileLoaded = true;
      return null;
    }
    try {
      const { data, error } = await sb.rpc("registro_web_perfil", { p_token: token() });
      if (error) throw error;
      applyProfile(data || null);
    } catch (err) {
      // Sin conexión: se usa lo último conocido en este navegador.
    }
    profileLoaded = true;
    return profile;
  }

  async function saveProfile(data, origen) {
    if (!sb) throw new Error("No se pudo conectar con BoomArt. Revisa tu conexión e intenta de nuevo.");
    const { data: result, error } = await sb.rpc("registro_web_guardar", { p_token: token(), p_data: data, p_origen: origen || "" });
    if (error) {
      const msg = error.code === "22023" && error.message ? error.message : "No se pudo guardar. Revisa tu conexión e intenta de nuevo.";
      throw new Error(msg);
    }
    applyProfile(result && result.perfil);
    try {
      window.sessionStorage.removeItem(DRAFT_KEY);
    } catch (err) {}
    if (window.BoomartTrack && result) window.BoomartTrack.event(result.nuevo ? "registro" : "registro_editado", { o: origen || "" });
    return result;
  }

  // ---------- Agencias Shalom (mismo buscador que /registro-cliente/) ----------

  let agenciesPromise = null;
  function agencies() {
    if (!agenciesPromise) {
      agenciesPromise = fetch(AGENCIES_URL)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []);
    }
    return agenciesPromise;
  }

  const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  // ---------- Formulario ----------

  const DOC_OPTIONS = [
    ["dni", "DNI"],
    ["ce", "Carné de extranjería"],
    ["pasaporte", "Pasaporte"]
  ];

  function validate(values, requireDelivery) {
    if (values.full_name.trim().length < 3) return ["full_name", "Ingresa tu nombre completo."];
    const phone = normalizePhone(values.phone);
    if (!/^9\d{8}$/.test(phone)) return ["phone", "Ingresa tu número de WhatsApp (9 dígitos, empieza con 9)."];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) return ["email", "Ingresa un correo válido."];
    const doc = values.document_number.replace(/[^A-Za-z0-9]/g, "");
    if (values.document_type === "dni" && !/^\d{8}$/.test(doc)) return ["document_number", "El DNI debe tener 8 dígitos."];
    if (values.document_type === "ce" && (doc.length < 9 || doc.length > 12)) return ["document_number", "El carné de extranjería debe tener entre 9 y 12 caracteres."];
    if (values.document_type === "pasaporte" && (doc.length < 6 || doc.length > 12)) return ["document_number", "El pasaporte debe tener entre 6 y 12 caracteres."];
    if (requireDelivery && !values.delivery_method) return ["delivery_method", "Elige cómo recibirás tu pedido."];
    return null;
  }

  /*
   * Pinta el formulario en `container`.
   * options: {
   *   context: "checkout" | "cupon" | "cuenta",
   *   submitLabel, requireDelivery (bool),
   *   onSaved(result) -> se llama con {nuevo, perfil} tras guardar.
   * }
   */
  function render(container, options) {
    const opts = options || {};
    const p = profile || {};
    const draft = (() => {
      try {
        return JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || "null");
      } catch (err) {
        return null;
      }
    })();
    const v = { ...p, ...(profile ? {} : draft || {}) };
    const docType = v.document_type || "dni";
    const method = v.delivery_method || "";
    let chosenAgency = method === "shalom" && v.shalom_name
      ? { nombre: v.shalom_name, direccion: v.shalom_address, departamento: v.shalom_department, provincia: v.shalom_province, distrito: v.shalom_district }
      : null;
    const deliveryHint = opts.requireDelivery
      ? "Elige una opción. Si no tienes la dirección a la mano, puedes dejarla en blanco: la coordinamos por WhatsApp."
      : "Opcional, pero nos ayuda a atenderte más rápido. Si no la tienes a la mano, la coordinamos por WhatsApp.";

    container.innerHTML = `
      <form class="reg-form" novalidate>
        <fieldset class="reg-section">
          <legend>Tus datos</legend>
          <label class="field">
            <span>Nombre completo</span>
            <input name="full_name" autocomplete="name" maxlength="160" required value="${esc(v.full_name)}">
          </label>
          <div class="reg-two">
            <label class="field">
              <span>WhatsApp</span>
              <input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="999 999 999" maxlength="20" required value="${esc(v.phone)}">
            </label>
            <label class="field">
              <span>Correo electrónico</span>
              <input name="email" type="email" autocomplete="email" placeholder="tucorreo@ejemplo.com" maxlength="180" required value="${esc(v.email)}">
            </label>
          </div>
          <p class="reg-email-hint">Verifica que tu correo esté bien escrito: ahí te enviaremos la confirmación de tu registro.</p>
          <div class="reg-two">
            <label class="field">
              <span>Tipo de documento</span>
              <select name="document_type" required>
                ${DOC_OPTIONS.map(([val, label]) => `<option value="${val}"${val === docType ? " selected" : ""}>${label}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Número de documento</span>
              <input name="document_number" autocomplete="off" maxlength="30" required value="${esc(v.document_number)}">
            </label>
          </div>
        </fieldset>

        <fieldset class="reg-section">
          <legend>¿Cómo recibirás tu pedido?</legend>
          <p class="reg-hint">${deliveryHint}</p>
          <div class="reg-choices" role="radiogroup">
            <label class="reg-choice"><input type="radio" name="delivery_method" value="indriver"${method === "indriver" ? " checked" : ""}><b>Envío local</b><small>Lima y Callao · InDrive</small></label>
            <label class="reg-choice"><input type="radio" name="delivery_method" value="shalom"${method === "shalom" ? " checked" : ""}><b>Envío por Shalom</b><small>A una agencia en provincias</small></label>
            <label class="reg-choice"><input type="radio" name="delivery_method" value="pickup"${method === "pickup" ? " checked" : ""}><b>Recojo</b><small>Coordinado con BoomArt</small></label>
          </div>
          <div class="reg-delivery" data-delivery="indriver" hidden>
            <div class="reg-two">
              <label class="field"><span>Distrito</span><input name="local_district" maxlength="100" value="${esc(v.local_district)}"></label>
              <label class="field"><span>Dirección</span><input name="local_address" maxlength="300" autocomplete="street-address" value="${esc(v.local_address)}"></label>
            </div>
            <label class="field"><span>Referencia</span><input name="local_reference" maxlength="200" value="${esc(v.local_reference)}"></label>
          </div>
          <div class="reg-delivery" data-delivery="shalom" hidden>
            <label class="field"><span>Busca tu agencia Shalom</span>
              <input class="reg-agency-search" autocomplete="off" placeholder="Distrito, provincia, agencia o dirección">
            </label>
            <div class="reg-agency-results" role="listbox"></div>
            <div class="reg-agency-chosen" hidden></div>
          </div>
          <p class="reg-delivery reg-pickup" data-delivery="pickup" hidden><b>Recojo en taller privado:</b> ${PICKUP_TEXT}</p>
        </fieldset>

        <p class="reg-privacy">Al registrarte autorizas a BoomArt a usar estos datos únicamente para registrar, coordinar y entregar tus pedidos.</p>
        <p class="form-error reg-error" role="alert" hidden></p>
        <button type="submit" class="button primary full reg-submit">${esc(opts.submitLabel || "Registrarme")}</button>
      </form>
    `;

    const form = container.querySelector(".reg-form");
    const errorEl = container.querySelector(".reg-error");
    const submitBtn = container.querySelector(".reg-submit");
    const search = container.querySelector(".reg-agency-search");
    const results = container.querySelector(".reg-agency-results");
    const chosenEl = container.querySelector(".reg-agency-chosen");

    const field = (name) => form.elements[name];
    const value = (name) => {
      const el = field(name);
      if (!el) return "";
      if (el instanceof RadioNodeList) return el.value || "";
      return (el.value || "").trim();
    };

    function showChosen() {
      chosenEl.hidden = !chosenAgency;
      chosenEl.innerHTML = chosenAgency
        ? `<b>${esc(chosenAgency.nombre)}</b><span>${esc(chosenAgency.direccion)}</span><small>${esc([chosenAgency.distrito, chosenAgency.provincia, chosenAgency.departamento].filter(Boolean).join(", "))}</small><button type="button" class="reg-agency-change">Cambiar agencia</button>`
        : "";
      search.closest(".field").hidden = Boolean(chosenAgency);
      const change = chosenEl.querySelector(".reg-agency-change");
      if (change) change.addEventListener("click", () => {
        chosenAgency = null;
        showChosen();
        search.value = "";
        search.focus();
      });
    }

    function syncDelivery() {
      const m = value("delivery_method");
      container.querySelectorAll("[data-delivery]").forEach((el) => {
        el.hidden = el.dataset.delivery !== m;
      });
      container.querySelectorAll(".reg-choice").forEach((el) => {
        el.classList.toggle("is-selected", el.querySelector("input").checked);
      });
      if (m === "shalom") agencies();
    }

    function values() {
      return {
        full_name: value("full_name"),
        phone: value("phone"),
        email: value("email"),
        document_type: value("document_type"),
        document_number: value("document_number"),
        delivery_method: value("delivery_method"),
        local_district: value("local_district"),
        local_address: value("local_address"),
        local_reference: value("local_reference"),
        shalom_name: chosenAgency ? chosenAgency.nombre : "",
        shalom_address: chosenAgency ? chosenAgency.direccion : "",
        shalom_department: chosenAgency ? chosenAgency.departamento : "",
        shalom_province: chosenAgency ? chosenAgency.provincia : "",
        shalom_district: chosenAgency ? chosenAgency.distrito : ""
      };
    }

    let searchTimer = null;
    search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        const q = fold(search.value.trim());
        results.innerHTML = "";
        if (q.length < 2) return;
        const words = q.split(/\s+/);
        const list = (await agencies()).filter((a) => {
          const hay = fold(Object.values(a).join(" "));
          return words.every((w) => hay.includes(w));
        }).slice(0, 20);
        if (!list.length) {
          results.innerHTML = `<p class="reg-agency-empty">No encontramos esa agencia. Prueba con tu distrito o provincia.</p>`;
          return;
        }
        list.forEach((a) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "reg-agency-option";
          b.innerHTML = `<b>${esc(a.nombre)}</b><small>${esc([a.distrito, a.provincia, a.departamento].filter(Boolean).join(", "))}</small><small>${esc(a.direccion)}</small>`;
          b.addEventListener("click", () => {
            chosenAgency = a;
            results.innerHTML = "";
            showChosen();
          });
          results.appendChild(b);
        });
      }, 150);
    });

    form.addEventListener("change", syncDelivery);
    // Borrador de esta pestaña: si cierra la ventana sin terminar, no pierde lo escrito.
    form.addEventListener("input", () => {
      if (profile) return;
      try {
        window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values()));
      } catch (err) {}
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorEl.hidden = true;
      const data = values();
      const problem = validate(data, Boolean(opts.requireDelivery));
      if (problem) {
        errorEl.textContent = problem[1];
        errorEl.hidden = false;
        const el = field(problem[0]);
        const focusable = el instanceof RadioNodeList ? el[0] : el;
        if (focusable && focusable.focus) focusable.focus();
        return;
      }
      submitBtn.disabled = true;
      const original = submitBtn.textContent;
      submitBtn.textContent = "Guardando…";
      try {
        const result = await saveProfile({ ...data, phone: normalizePhone(data.phone) }, opts.context || "");
        if (typeof opts.onSaved === "function") opts.onSaved(result);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = original;
      }
    });

    syncDelivery();
    showChosen();
    return form;
  }

  // ---------- "Mi cuenta" y "Reclama 10 %": la misma ventana de la página ----------

  const accountDialog = document.querySelector("#accountDialog");
  const accountBody = document.querySelector("#accountBody");
  const accountToggle = document.querySelector("#accountToggle");
  const closeAccount = document.querySelector("#closeAccount");

  function couponNote(p) {
    return p && p.cupon_disponible
      ? `<p class="reg-coupon">🎁 Tu <strong>10 % de bienvenida</strong> está activo: se descuenta en tu carrito al pagar con Yape, Plin o transferencia, finalizando tu compra aquí en boomart.pe.</p>`
      : "";
  }

  function renderDone(result) {
    const p = result.perfil || profile || {};
    const cartHasItems = window.BoomartCart && window.BoomartCart.getState().lines.length > 0;
    accountBody.innerHTML = `
      <div class="reg-done">
        <img class="reg-done-mark" src="assets/brand/boomart-icon-asistente.png?v=1" alt="">
        <p class="eyebrow">${result.nuevo ? "Registro completado" : "Datos actualizados"}</p>
        <h2>${result.nuevo ? `¡Listo, ${esc(firstName(p.full_name))}!` : "¡Guardado!"}</h2>
        ${result.nuevo ? `<p>Tu registro en BoomArt quedó hecho. Te enviamos un correo a <strong>${esc(p.email)}</strong> para que confirmes tu registro.</p>` : `<p>Tus datos quedaron actualizados.</p>`}
        ${couponNote(p)}
        <div class="checkout-actions">
          ${cartHasItems ? `<button type="button" class="button primary full" data-reg-go="checkout">Finalizar mi compra</button>` : ""}
          <button type="button" class="button ${cartHasItems ? "secondary" : "primary"} full" data-reg-go="close">Seguir comprando</button>
        </div>
      </div>`;
  }

  function openAccount(context) {
    if (!accountDialog || !accountBody) return;
    const ctx = context || (profile ? "cuenta" : "cupon");
    const isCoupon = ctx === "cupon" && !profile;
    accountBody.innerHTML = `
      <p class="eyebrow">${profile ? "Mi cuenta" : isCoupon ? "Beneficio de bienvenida" : "Regístrate en 1 minuto"}</p>
      <h2>${profile ? `Hola, ${esc(firstName(profile.full_name))}` : isCoupon ? "Regístrate y activa tu 10 %" : "Crea tu registro BoomArt"}</h2>
      <p class="field-hint">${profile
        ? "Estos son tus datos para tus pedidos. Puedes corregirlos cuando quieras."
        : "Regístrate una sola vez para comprar en boomart.pe y recibir tu 10 % de descuento en tu primera compra."}</p>
      ${profile ? couponNote(profile) : ""}
      <div class="reg-mount"></div>`;
    render(accountBody.querySelector(".reg-mount"), {
      context: ctx,
      submitLabel: profile ? "Guardar mis datos" : isCoupon ? "Registrarme y activar mi 10 %" : "Registrarme",
      onSaved: renderDone
    });
    if (!accountDialog.open) accountDialog.showModal();
  }

  if (accountDialog && accountBody) {
    accountBody.addEventListener("click", (event) => {
      const go = event.target.closest("[data-reg-go]");
      if (!go) return;
      accountDialog.close();
      if (go.dataset.regGo === "checkout") {
        const start = document.querySelector("#startCheckout");
        if (start) start.click();
      }
    });
    if (closeAccount) closeAccount.addEventListener("click", () => accountDialog.close());
  }
  if (accountToggle) {
    accountToggle.addEventListener("click", () => {
      let viaCoupon = false;
      try {
        viaCoupon = window.localStorage.getItem("boomart_coupon_intent") === "1";
        window.localStorage.removeItem("boomart_coupon_intent");
      } catch (err) {}
      openAccount(viaCoupon && !profile ? "cupon" : profile ? "cuenta" : "cuenta");
    });
  }

  // ---------- Botón "Confirmar mi registro" del correo de bienvenida ----------

  function toast(title, text) {
    if (!accountDialog || !accountBody) return;
    accountBody.innerHTML = `
      <div class="reg-done">
        <img class="reg-done-mark" src="assets/brand/boomart-icon-asistente.png?v=1" alt="">
        <h2>${esc(title)}</h2>
        <p>${esc(text)}</p>
        <div class="checkout-actions"><button type="button" class="button primary full" data-reg-go="close">Ir a la tienda</button></div>
      </div>`;
    if (!accountDialog.open) accountDialog.showModal();
  }

  async function handleConfirmLink() {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("confirmar");
    if (!t) return;
    url.searchParams.delete("confirmar");
    window.history.replaceState(window.history.state, "", url.pathname + (url.search || "") + url.hash);
    if (!sb) return;
    try {
      const { data } = await sb.rpc("registro_web_confirmar", { p_token: t });
      if (data && data.ok) {
        toast(`¡Gracias${data.nombre ? `, ${data.nombre}` : ""}!`, "Tu registro en BoomArt quedó confirmado. Ya puedes seguir comprando.");
      } else {
        toast("Enlace no válido", "Este enlace de confirmación no es válido o ya no está disponible. Si necesitas ayuda, escríbenos por WhatsApp.");
      }
    } catch (err) {}
  }

  // ---------- Carrito (para el remarketing) y pedido enviado ----------

  let cartTimer = null;
  function syncCart() {
    if (!sb || !profile || !window.BoomartCart) return;
    clearTimeout(cartTimer);
    cartTimer = setTimeout(() => {
      const items = window.BoomartCart.getState().lines.map((line) => ({
        productId: line.productId,
        variant: line.variantKey || null,
        quantity: line.quantity
      }));
      sb.rpc("registro_web_carrito", { p_token: token(), p_items: items }).then(() => {}, () => {});
    }, 2500);
  }
  if (window.BoomartCart && typeof window.BoomartCart.subscribe === "function") {
    window.BoomartCart.subscribe(syncCart);
  }

  // checkout.js avisa cuando se envió el pedido: detiene el remarketing y, si
  // llevaba el cupón, lo consume en el servidor (una sola vez por documento).
  document.addEventListener("boomart:order-sent", async (event) => {
    if (!sb) return;
    const detail = (event && event.detail) || {};
    try {
      await sb.rpc("registro_web_pedido", { p_token: token(), p_cupon: Boolean(detail.couponApplied) });
    } catch (err) {}
    loadProfile();
  });

  window.BoomartRegistro = {
    render,
    openAccount,
    loadProfile,
    deliveryFromProfile,
    profile: () => profile,
    isLoaded: () => profileLoaded,
    onChange: (fn) => listeners.add(fn)
  };

  loadProfile();
  handleConfirmLink();
})();
