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
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
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

  function renderNeedsName(user) {
    accountBody.innerHTML = `
      <p class="eyebrow">Ya casi · Mi cuenta</p>
      <h2>¿Cómo te llamas?</h2>
      <p class="field-hint">Con esto completamos tu registro. Correo: <strong>${user.email}</strong></p>
      <form id="accountNameForm" novalidate>
        <label class="field">
          <span>Nombre</span>
          <input type="text" id="accountNameInput" autocomplete="given-name" required>
        </label>
        <label class="field">
          <span>Apellido</span>
          <input type="text" id="accountLastNameInput" autocomplete="family-name" required>
        </label>
        <p class="form-error" id="accountFormError" hidden></p>
        <button type="submit" class="button primary full">Guardar</button>
      </form>
    `;
    const form = document.querySelector("#accountNameForm");
    const nameInput = document.querySelector("#accountNameInput");
    const lastNameInput = document.querySelector("#accountLastNameInput");
    const errorEl = document.querySelector("#accountFormError");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const nombre = nameInput.value.trim();
      const apellido = lastNameInput.value.trim();
      if (!nombre || !apellido) return;
      const submitBtn = form.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      const { error } = await sb.from("clientes").upsert({ id: user.id, nombre, apellido, correo: user.email });
      if (error) {
        errorEl.textContent = "No se pudo guardar. Intenta de nuevo.";
        errorEl.hidden = false;
        submitBtn.disabled = false;
        return;
      }
      refreshAccountUI();
    });
  }

  function renderProfile(cliente, user, history) {
    const nombreCompleto = [cliente.nombre, cliente.apellido].filter(Boolean).join(" ");
    accountLabel.textContent = cliente.nombre;
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
      <h2>Hola, ${nombreCompleto}</h2>
      <p class="field-hint">${user.email}</p>
      ${historyHtml}
      <div class="checkout-actions">
        <button type="button" class="button secondary full" id="accountSignOutBtn">Cerrar sesión</button>
      </div>
    `;
    document.querySelector("#accountSignOutBtn").addEventListener("click", async () => {
      await sb.auth.signOut();
      accountLabel.textContent = "Mi cuenta";
      activeCarritoId = null;
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
    const { data: cliente } = await sb.from("clientes").select("nombre, apellido, correo").eq("id", user.id).maybeSingle();
    if (!cliente || !cliente.nombre) {
      renderNeedsName(user);
      return;
    }
    const history = await loadCartHistory(user.id);
    renderProfile(cliente, user, history);
  }

  accountToggle.addEventListener("click", () => {
    refreshAccountUI();
    accountDialog.showModal();
  });
  closeAccountBtn.addEventListener("click", () => accountDialog.close());

  // Si el cliente ya tiene sesion guardada (visita anterior), refleja su
  // nombre en el boton del header y trae su carrito guardado si el de este
  // dispositivo esta vacio (sin tener que abrir el dialogo "Mi cuenta").
  sb.auth.getSession().then(({ data: { session } }) => {
    if (!session || !session.user) return;
    sb.from("clientes").select("nombre").eq("id", session.user.id).maybeSingle().then(({ data }) => {
      if (data && data.nombre) accountLabel.textContent = data.nombre;
    });
    whenProductsReady(() => restoreCartIfEmpty(session.user));
  });

  // Cuando vuelve del enlace magico (o cambia la sesion en otra pestaña),
  // actualiza el dialogo y lo abre automaticamente para que complete su
  // nombre sin tener que buscar el boton "Mi cuenta".
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN") {
      refreshAccountUI();
      if (!accountDialog.open) accountDialog.showModal();
      if (session && session.user) whenProductsReady(() => restoreCartIfEmpty(session.user));
    }
  });

  // Cada vez que el carrito local cambia, si hay sesion activa, se guarda
  // una copia en Supabase (respaldo + historial). No afecta a un cliente
  // sin cuenta: sigue usando solo localStorage, como siempre.
  window.BoomartCart.subscribe(async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) syncActiveCart(session.user);
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
