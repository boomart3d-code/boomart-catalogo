/*
 * Cuenta de cliente (Fase 1): registro/login por enlace magico (sin
 * contrasenas) usando Supabase. Vive completamente aparte de cart.js y
 * checkout.js -- no los modifica ni depende de ellos. Si Supabase no carga
 * (CDN caido, bloqueado, etc.) el boton "Mi cuenta" simplemente no hace nada
 * y el resto de la web (catalogo, carrito, checkout por WhatsApp) sigue
 * funcionando igual.
 */
(function () {
  "use strict";

  const config = window.BOOMART_SUPABASE;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib || typeof supabaseLib.createClient !== "function") return;

  // Si el cliente acaba de hacer clic en el enlace magico de su correo, la
  // URL trae el token de acceso en el hash (#access_token=...) ANTES de que
  // Supabase lo consuma. Es la unica situacion en la que abrimos "Mi cuenta"
  // solos: el cliente acaba de pedir entrar, a proposito. Una simple visita
  // a la web (con sesion ya guardada de antes) NUNCA debe abrir nada solo --
  // se navega libre, como cualquier tienda online, y la cuenta se ofrece
  // recien cuando el cliente la busca (boton "Mi cuenta") o va a pagar.
  const arrivedViaMagicLink = /[#&](access_token|refresh_token)=/.test(window.location.hash);

  const sb = supabaseLib.createClient(config.url, config.publishableKey);

  const accountToggle = document.querySelector("#accountToggle");
  const accountLabel = document.querySelector("#accountLabel");
  const accountDialog = document.querySelector("#accountDialog");
  const closeAccountBtn = document.querySelector("#closeAccount");
  const accountBody = document.querySelector("#accountBody");
  if (!accountToggle || !accountDialog || !accountBody) return;

  // ---------- Fase 2: carrito ligado a la cuenta (recordarlo entre visitas
  // y dispositivos, marcarlo como completado cuando se envia el pedido) ----------

  // Recuerda a que fila de "carritos" corresponde el carrito activo actual,
  // para actualizar esa misma fila en vez de crear una nueva en cada cambio.
  // Se guarda por usuario porque, si cierra sesion y otro cliente usa el
  // mismo navegador, no debe heredar el carrito enlazado del anterior.
  const CART_LINK_KEY = "boomart_active_carrito_v1";
  let activeCarritoId = null;

  function safeGetLocal(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }
  function safeSetLocal(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      // almacenamiento no disponible -- el carrito sigue funcionando, solo
      // no se recuerda cual fila de Supabase le corresponde.
    }
  }
  function safeRemoveLocal(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {}
  }

  function getLinkedCarritoId(userId) {
    const raw = safeGetLocal(CART_LINK_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && parsed.userId === userId ? parsed.carritoId : null;
    } catch (err) {
      return null;
    }
  }
  function setLinkedCarritoId(userId, carritoId) {
    safeSetLocal(CART_LINK_KEY, JSON.stringify({ userId, carritoId }));
  }

  // ---------- Puente con el checkout: la cuenta ya sabe el nombre (y a
  // veces el destino) del cliente -- se lo pasamos al formulario del
  // checkout usando la MISMA llave de localStorage que checkout.js ya lee
  // (funcion prefillCustomerForm), asi no hace falta tocar esa logica. ----------
  const CUSTOMER_STORAGE_KEY = "boomart_customer_v1";

  function mergeCustomerLocal(patch) {
    let current = {};
    try {
      const raw = window.localStorage.getItem(CUSTOMER_STORAGE_KEY);
      if (raw) current = JSON.parse(raw) || {};
    } catch (err) {
      current = {};
    }
    try {
      window.localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
    } catch (err) {
      // almacenamiento no disponible -- el checkout simplemente le
      // volvera a pedir los datos, sin romper nada.
    }
  }

  // Pasa nombre/apellido y (si ya los tiene) destino/distrito/documento de
  // la cuenta al checkout, para que no se los vuelva a preguntar. Tambien
  // marca "isAccountCustomer" -- el checkout usa esa marca para decidir si
  // muestra el campo (opcional) de documento para la boleta, que solo se
  // pide a clientes con cuenta, no a invitados.
  function syncCustomerProfileToCheckout(cliente) {
    const patch = { isAccountCustomer: true };
    if (cliente.nombre) patch.name = cliente.nombre;
    if (cliente.apellido) patch.lastName = cliente.apellido;
    if (cliente.telefono) patch.phone = cliente.telefono;
    if (cliente.correo) patch.email = cliente.correo;
    if (cliente.destino) patch.destination = cliente.destino;
    if (cliente.lima_distrito) patch.limaDistrict = cliente.lima_distrito;
    if (cliente.prov_departamento) patch.provDepartment = cliente.prov_departamento;
    if (cliente.prov_provincia) patch.provProvince = cliente.prov_provincia;
    if (cliente.direccion_detalle) patch.addressDetail = cliente.direccion_detalle;
    if (cliente.tipo_documento) patch.docType = cliente.tipo_documento;
    if (cliente.dni) patch.docNumber = cliente.dni;
    mergeCustomerLocal(patch);
  }

  function cartLinesToItems(lines) {
    return lines.map((line) => ({ productId: line.productId, variant: line.variantKey || null, quantity: line.quantity }));
  }

  function whenProductsReady(callback) {
    if (window.BOOMART_PRODUCTS && window.BOOMART_PRODUCTS.length) {
      callback();
      return;
    }
    document.addEventListener("boomart:products-ready", callback, { once: true });
  }

  // Guarda (o crea) la fila "activa" del carrito de este cliente en Supabase.
  // Se llama en cada cambio del carrito local -- es una copia de respaldo,
  // el carrito local (localStorage, cart.js) sigue siendo el que manda
  // mientras el cliente esta comprando en este mismo dispositivo.
  async function syncActiveCart(user) {
    const state = window.BoomartCart.getState();
    if (!state.lines.length) return;
    const items = cartLinesToItems(state.lines);

    const knownId = activeCarritoId || getLinkedCarritoId(user.id);
    if (knownId) {
      const { error } = await sb
        .from("carritos")
        .update({ items, actualizado_en: new Date().toISOString() })
        .eq("id", knownId)
        .eq("estado", "activo");
      if (!error) {
        activeCarritoId = knownId;
        return;
      }
    }

    // No hay fila enlazada (o ya no esta activa): busca si el cliente tiene
    // una desde otra pestana/dispositivo antes de crear una nueva.
    const { data: existing } = await sb
      .from("carritos")
      .select("id")
      .eq("cliente_id", user.id)
      .eq("estado", "activo")
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      activeCarritoId = existing.id;
      setLinkedCarritoId(user.id, existing.id);
      await sb.from("carritos").update({ items, actualizado_en: new Date().toISOString() }).eq("id", existing.id);
      return;
    }

    const { data: created } = await sb.from("carritos").insert({ cliente_id: user.id, items }).select("id").maybeSingle();
    if (created) {
      activeCarritoId = created.id;
      setLinkedCarritoId(user.id, created.id);
    }
  }

  // Si el cliente entra desde un dispositivo nuevo (carrito local vacio) y
  // tiene un carrito activo guardado en su cuenta, lo trae de vuelta.
  async function restoreCartIfEmpty(user) {
    if (window.BoomartCart.getState().lines.length) return;
    const { data } = await sb
      .from("carritos")
      .select("id, items")
      .eq("cliente_id", user.id)
      .eq("estado", "activo")
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data || !Array.isArray(data.items) || !data.items.length) return;
    data.items.forEach((item) => window.BoomartCart.add(item.productId, item.variant, item.quantity));
    activeCarritoId = data.id;
    setLinkedCarritoId(user.id, data.id);
  }

  // Al iniciar sesion: si ya tenia productos en el carrito de este navegador
  // (los agrego como invitado antes de registrarse), los sube a su cuenta.
  // Si el carrito de este navegador esta vacio, trae el ultimo que tenia
  // guardado (por ejemplo, entrando desde otro dispositivo).
  function syncOrRestoreCart(user) {
    whenProductsReady(() => {
      const state = window.BoomartCart.getState();
      if (state.lines.length) {
        syncActiveCart(user);
      } else {
        restoreCartIfEmpty(user);
      }
    });
  }

  async function loadCartHistory(userId) {
    const { data } = await sb
      .from("carritos")
      .select("items, estado, creado_en")
      .eq("cliente_id", userId)
      .order("creado_en", { ascending: false })
      .limit(5);
    return data || [];
  }

  function estadoLabel(estado) {
    if (estado === "completado") return "Enviado por WhatsApp";
    if (estado === "abandonado") return "Abandonado";
    return "En curso";
  }

  // Si la consulta a Supabase falla (por ejemplo, la sesion necesita
  // refrescarse) NO hay que mostrar el formulario vacio como si el cliente
  // no hubiera guardado nada -- eso invita a que vuelva a escribir todo y
  // se genere un duplicado. Se avisa el problema y se deja reintentar.
  function renderLoadError(user) {
    accountBody.innerHTML = `
      <p class="eyebrow">Mi cuenta</p>
      <h2>No pudimos cargar tus datos</h2>
      <p class="field-hint">Correo: <strong>${user.email}</strong></p>
      <p class="form-error">Hubo un problema de conexión. Intenta de nuevo.</p>
      <div class="checkout-actions">
        <button type="button" class="button primary full" id="accountRetryBtn">Reintentar</button>
        <button type="button" class="button secondary full" id="accountSignOutBtnError">Cerrar sesión</button>
      </div>
    `;
    document.querySelector("#accountRetryBtn").addEventListener("click", refreshAccountUI);
    document.querySelector("#accountSignOutBtnError").addEventListener("click", async () => {
      await sb.auth.signOut();
      accountLabel.textContent = "Mi cuenta";
      mergeCustomerLocal({ isAccountCustomer: false });
      refreshAccountUI();
    });
  }

  function renderLoggedOut() {
    accountBody.innerHTML = `
      <p class="eyebrow">Mi cuenta</p>
      <h2>Ingresa con tu correo</h2>
      <p class="field-hint">Te enviamos un enlace de acceso a tu correo -- sin contraseñas que recordar ni crear.</p>
      <form id="accountEmailForm" novalidate>
        <label class="field">
          <span>Correo electrónico</span>
          <input type="email" id="accountEmailInput" autocomplete="email" required>
        </label>
        <p class="form-error" id="accountFormError" hidden></p>
        <button type="submit" class="button primary full">Enviarme el enlace de acceso</button>
      </form>
    `;
    const form = document.querySelector("#accountEmailForm");
    const emailInput = document.querySelector("#accountEmailInput");
    const errorEl = document.querySelector("#accountFormError");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = emailInput.value.trim();
      if (!email) return;
      const submitBtn = form.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      // Fijo a boomart.pe a proposito (no window.location.origin): asi el
      // enlace del correo siempre entra al sitio real, sin importar si la
      // solicitud se hizo desde una copia local de pruebas.
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: "https://boomart.pe/" }
      });
      if (error) {
        errorEl.textContent = "No se pudo enviar el enlace. Intenta de nuevo en unos minutos.";
        errorEl.hidden = false;
        submitBtn.disabled = false;
        return;
      }
      renderLinkSent(email);
    });
  }

  function renderLinkSent(email) {
    accountBody.innerHTML = `
      <p class="eyebrow">Revisa tu correo</p>
      <h2>Te enviamos un enlace</h2>
      <p>Abre el correo que le llegó a <strong>${email}</strong> y haz clic en el enlace para ingresar. Puedes cerrar esta ventana mientras tanto.</p>
    `;
  }

  // Sin opcion "Prefiero no decir": el campo sigue siendo opcional (no se
  // exige llenar el numero para guardar), pero si se elige un tipo, DNI es
  // la sugerencia por defecto en vez de dejar una salida vacia en el menu.
  const DOC_TYPE_OPTIONS = [
    { value: "dni", label: "DNI" },
    { value: "ce", label: "Carné de extranjería" },
    { value: "pasaporte", label: "Pasaporte" }
  ];

  // Panel unico de "Mi cuenta": muestra siempre lo que ya se sabe del
  // cliente (vacio si nunca lo lleno) y lo deja editar y guardar cambios,
  // en vez de un formulario de "registro" que reaparecia como si nada
  // estuviera guardado. Sirve tanto para el primer registro como para
  // corregir datos despues -- es el mismo panel siempre.
  function renderAccountPanel(cliente, user, history) {
    const nombre = (cliente && cliente.nombre) || "";
    const apellido = (cliente && cliente.apellido) || "";
    const telefono = (cliente && cliente.telefono) || "";
    // Si no hay tipo de documento guardado, sugerimos "DNI" (el mas comun)
    // en vez de dejar seleccionado "Prefiero no decir" por defecto.
    const docType = (cliente && cliente.tipo_documento) || "dni";
    const docNumber = (cliente && cliente.dni) || "";

    if (nombre) accountLabel.textContent = nombre;

    const historyHtml = history.length
      ? `
        <div class="account-history">
          <p class="account-history-title">Tus últimos carritos</p>
          ${history
            .map(
              (row) => `
                <div class="account-history-row">
                  <span>${new Date(row.creado_en).toLocaleDateString("es-PE")}</span>
                  <span>${(row.items || []).length} producto(s)</span>
                  <span class="account-history-status">${estadoLabel(row.estado)}</span>
                </div>
              `
            )
            .join("")}
        </div>
      `
      : "";

    accountBody.innerHTML = `
      <p class="eyebrow">Mi cuenta</p>
      <h2>Tus datos</h2>
      <p class="field-hint">Correo: <strong>${user.email}</strong></p>
      <form id="accountProfileForm" novalidate>
        <label class="field">
          <span>Nombre</span>
          <input type="text" id="accountNameInput" autocomplete="given-name" value="${nombre}" required>
        </label>
        <label class="field">
          <span>Apellido</span>
          <input type="text" id="accountLastNameInput" autocomplete="family-name" value="${apellido}" required>
        </label>
        <label class="field">
          <span>Teléfono / WhatsApp</span>
          <input type="tel" id="accountPhoneInput" autocomplete="tel" placeholder="999 999 999" value="${telefono}" required>
        </label>
        <div class="document-fields-row">
          <label class="field">
            <span>Tipo de documento</span>
            <select id="accountDocType">
              ${DOC_TYPE_OPTIONS.map(
                (opt) => `<option value="${opt.value}"${opt.value === docType ? " selected" : ""}>${opt.label}</option>`
              ).join("")}
            </select>
          </label>
          <label class="field">
            <span>Número de documento</span>
            <input type="text" id="accountDocNumber" value="${docNumber}">
          </label>
        </div>
        <p class="form-error" id="accountFormError" hidden></p>
        <button type="submit" class="button primary full" id="accountSaveBtn">Guardar cambios</button>
      </form>
      ${historyHtml}
      <div class="checkout-actions">
        <button type="button" class="button secondary full" id="accountKeepShoppingBtn">Seguir comprando</button>
        <button type="button" class="button secondary full" id="accountSignOutBtn">Cerrar sesión</button>
      </div>
    `;

    const form = document.querySelector("#accountProfileForm");
    const nameInput = document.querySelector("#accountNameInput");
    const lastNameInput = document.querySelector("#accountLastNameInput");
    const phoneInput = document.querySelector("#accountPhoneInput");
    const docTypeInput = document.querySelector("#accountDocType");
    const docNumberInput = document.querySelector("#accountDocNumber");
    const errorEl = document.querySelector("#accountFormError");
    const saveBtn = document.querySelector("#accountSaveBtn");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const newNombre = nameInput.value.trim();
      const newApellido = lastNameInput.value.trim();
      const newTelefono = phoneInput.value.trim();
      if (!newNombre || !newApellido || !newTelefono) {
        errorEl.textContent = "Nombre, apellido y teléfono son obligatorios.";
        errorEl.hidden = false;
        return;
      }
      errorEl.hidden = true;
      saveBtn.disabled = true;
      const newDocType = docTypeInput.value;
      const newDocNumber = docNumberInput.value.trim();
      const { error } = await sb.from("clientes").upsert({
        id: user.id,
        nombre: newNombre,
        apellido: newApellido,
        correo: user.email,
        telefono: newTelefono,
        tipo_documento: newDocType || null,
        dni: newDocNumber || null
      });
      saveBtn.disabled = false;
      if (error) {
        errorEl.textContent = "No se pudo guardar. Intenta de nuevo.";
        errorEl.hidden = false;
        return;
      }
      accountLabel.textContent = newNombre;
      mergeCustomerLocal({
        name: [newNombre, newApellido].filter(Boolean).join(" "),
        isAccountCustomer: true,
        docType: newDocType || undefined,
        docNumber: newDocNumber || undefined
      });
      syncOrRestoreCart(user);
      const original = saveBtn.textContent;
      saveBtn.textContent = "¡Guardado!";
      setTimeout(() => {
        saveBtn.textContent = original;
      }, 1500);
    });

    document.querySelector("#accountKeepShoppingBtn").addEventListener("click", () => accountDialog.close());
    document.querySelector("#accountSignOutBtn").addEventListener("click", async () => {
      await sb.auth.signOut();
      accountLabel.textContent = "Mi cuenta";
      activeCarritoId = null;
      mergeCustomerLocal({ isAccountCustomer: false });
      refreshAccountUI();
    });
  }

  async function refreshAccountUI() {
    const { data: { session } } = await sb.auth.getSession();
    const user = session && session.user;
    if (!user) {
      renderLoggedOut();
      return;
    }
    const { data: cliente, error } = await sb
      .from("clientes")
      .select("nombre, apellido, correo, destino, lima_distrito, prov_departamento, prov_provincia, direccion_detalle, dni, tipo_documento, telefono")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      // Queda en la consola para poder diagnosticar si vuelve a pasar
      // (revisa la pestaña Console de las herramientas de desarrollador).
      console.error("BoomArt: no se pudo cargar el perfil de la cuenta", error);
      renderLoadError(user);
      return;
    }
    if (cliente && cliente.nombre) syncCustomerProfileToCheckout(cliente);
    const history = cliente ? await loadCartHistory(user.id) : [];
    renderAccountPanel(cliente, user, history);
  }

  accountToggle.addEventListener("click", () => {
    refreshAccountUI();
    accountDialog.showModal();
  });
  closeAccountBtn.addEventListener("click", () => accountDialog.close());

  // Si el cliente ya tiene sesion guardada (visita anterior), refleja su
  // nombre en el boton del header y trae su carrito guardado si el de este
  // dispositivo esta vacio -- SIN abrir ni tocar nada mas: navegar la web
  // nunca debe interrumpirse con un dialogo, tenga cuenta o no.
  sb.auth.getSession().then(({ data: { session } }) => {
    if (!session || !session.user) return;
    sb
      .from("clientes")
      .select("nombre, apellido, correo, destino, lima_distrito, prov_departamento, prov_provincia, direccion_detalle, dni, tipo_documento, telefono")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data || !data.nombre) return;
        accountLabel.textContent = data.nombre;
        syncCustomerProfileToCheckout(data);
      });
    syncOrRestoreCart(session.user);
  });

  // Supabase dispara "SIGNED_IN" no solo cuando el cliente hace clic en el
  // enlace magico, sino tambien cada vez que revalida la sesion guardada
  // (por ejemplo, al cargar la pagina o al volver de otra pestana). Abrir
  // "Mi cuenta" solo en el PRIMER caso -- se detecta porque la URL trae el
  // token en el hash (ver "arrivedViaMagicLink" arriba) -- evita que el
  // dialogo aparezca solo mientras el cliente navega sin pedirlo.
  let magicLinkHandled = false;
  sb.auth.onAuthStateChange((event, session) => {
    if (event !== "SIGNED_IN" || !arrivedViaMagicLink || magicLinkHandled) return;
    if (!session || !session.user) return;
    magicLinkHandled = true;
    refreshAccountUI();
    if (!accountDialog.open) accountDialog.showModal();
    syncOrRestoreCart(session.user);
  });

  // Cada vez que el carrito local cambia, si hay sesion activa, se guarda
  // una copia en Supabase (respaldo + historial). No afecta a un cliente
  // sin cuenta: sigue usando solo localStorage, como siempre.
  window.BoomartCart.subscribe(async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) syncActiveCart(session.user);
  });

  // checkout.js avisa con este evento cuando el cliente completa el paso de
  // destino/distrito -- si esta logueado, lo guardamos en su cuenta para
  // que no se lo vuelva a preguntar, ni siquiera desde otro dispositivo.
  document.addEventListener("boomart:customer-destination-saved", async (event) => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session || !session.user) return;
    const d = event.detail || {};
    await sb
      .from("clientes")
      .update({
        nombre: d.name || null,
        apellido: d.lastName || null,
        telefono: d.phone || null,
        destino: d.destination || null,
        lima_distrito: d.limaDistrict || null,
        prov_departamento: d.provDepartment || null,
        prov_provincia: d.provProvince || null,
        direccion_detalle: d.addressDetail || null
      })
      .eq("id", session.user.id);
  });

  // checkout.js avisa con este evento cuando el cliente (logueado) deja su
  // documento opcional para la boleta -- se guarda en su cuenta.
  document.addEventListener("boomart:customer-document-saved", async (event) => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session || !session.user) return;
    const d = event.detail || {};
    if (!d.docType || !d.docNumber) return;
    await sb.from("clientes").update({ tipo_documento: d.docType, dni: d.docNumber }).eq("id", session.user.id);
  });

  // checkout.js avisa con este evento cuando el pedido ya se mando por
  // WhatsApp -- marca ese carrito como historial y libera el enlace para
  // que el proximo carrito (si arma uno nuevo) cree una fila aparte.
  document.addEventListener("boomart:order-sent", async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session || !session.user) return;
    const carritoId = activeCarritoId || getLinkedCarritoId(session.user.id);
    if (!carritoId) return;
    await sb.from("carritos").update({ estado: "completado", actualizado_en: new Date().toISOString() }).eq("id", carritoId);
    activeCarritoId = null;
    safeRemoveLocal(CART_LINK_KEY);
  });
})();
