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

  function renderProfile(cliente, user) {
    const nombreCompleto = [cliente.nombre, cliente.apellido].filter(Boolean).join(" ");
    accountLabel.textContent = cliente.nombre;
    accountBody.innerHTML = `
      <p class="eyebrow">Mi cuenta</p>
      <h2>Hola, ${nombreCompleto}</h2>
      <p class="field-hint">${user.email}</p>
      <div class="checkout-actions">
        <button type="button" class="button secondary full" id="accountSignOutBtn">Cerrar sesión</button>
      </div>
    `;
    document.querySelector("#accountSignOutBtn").addEventListener("click", async () => {
      await sb.auth.signOut();
      accountLabel.textContent = "Mi cuenta";
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
    renderProfile(cliente, user);
  }

  accountToggle.addEventListener("click", () => {
    refreshAccountUI();
    accountDialog.showModal();
  });
  closeAccountBtn.addEventListener("click", () => accountDialog.close());

  // Si el cliente ya tiene sesion guardada (visita anterior), refleja su
  // nombre en el boton del header sin que tenga que abrir el dialogo.
  sb.auth.getSession().then(({ data: { session } }) => {
    if (!session || !session.user) return;
    sb.from("clientes").select("nombre").eq("id", session.user.id).maybeSingle().then(({ data }) => {
      if (data && data.nombre) accountLabel.textContent = data.nombre;
    });
  });

  // Cuando vuelve del enlace magico (o cambia la sesion en otra pestaña),
  // actualiza el dialogo y lo abre automaticamente para que complete su
  // nombre sin tener que buscar el boton "Mi cuenta".
  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN") {
      refreshAccountUI();
      if (!accountDialog.open) accountDialog.showModal();
    }
  });
})();
