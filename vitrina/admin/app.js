/* Panel de BoomArt para la vitrina: validar y publicar productos, administrar vendedores y accesos, ocultar productos y ver la bitacora.
 * Lee con su propio JWT (RLS deja pasar al personal de BoomArt) y escribe SOLO por la funcion `vitrina-admin`.
 * Seguridad: nunca innerHTML con datos (se arma el DOM con textContent), sin scripts ni estilos en linea, la clave de un acceso nuevo
 * se muestra una sola vez y no se guarda en ningun lado. */
(function () {
  "use strict";

  const cfg = window.VITRINA_CONFIG;
  const sb = window.supabase.createClient(cfg.apiUrl, cfg.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "vitrina-admin-auth" },
    db: { schema: "vitrina" },
  });
  const BUCKET = "vitrina-borradores";
  const REVIEW_CHUNK = 10;
  const PAGE_SIZE = 50;
  const STATE_LABEL = { borrador: "Sin enviar", en_validacion: "Para validar", cambios_pedidos: "Cambios pedidos", aprobado: "Publicado" };
  const STATE_CLASS = { borrador: "", en_validacion: "warn", cambios_pedidos: "bad", aprobado: "ok" };

  const $ = (id) => document.getElementById(id);
  const state = { staff: null, tab: "validar", productsPage: 0, sellersCache: [], stamps: new Map() };

  // ------------------------------------------------------------------------------------------ utilidades de DOM
  function h(tag, props, ...kids) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
      else if (value === true) node.setAttribute(key, "");
      else node.setAttribute(key, String(value));
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  const money = (value) => (value === null || value === undefined ? "—" : "S/ " + Number(value).toFixed(2));
  const when = (iso) => (iso ? new Date(iso).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" }) : "—");

  function toast(message, isError) {
    const node = h("div", { class: "toast" + (isError ? " error" : ""), text: message });
    $("toasts").append(node);
    setTimeout(() => node.remove(), isError ? 7000 : 3500);
  }

  function openDialog(title, body, buttons, wide) {
    const host = $("dialog-host");
    const previousFocus = document.activeElement;
    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      if (previousFocus && previousFocus.focus) previousFocus.focus();
    };
    const onKey = (event) => { if (event.key === "Escape") close(); };
    const footer = h("div", { class: "actions" }, (buttons || []).map((b) => h("button", {
      class: "btn" + (b.primary ? " primary" : "") + (b.danger ? " danger" : ""), type: "button", text: b.label,
      onclick: async (event) => {
        const button = event.currentTarget;
        if (b.keepOpen) { await b.run(close); return; }
        button.disabled = true;
        try { const keep = await b.run?.(close); if (keep !== false) close(); } finally { button.disabled = false; }
      },
    })));
    const dialog = h("div", { class: "dialog" + (wide ? " wide" : ""), role: "dialog", "aria-modal": "true", "aria-label": title }, h("h2", { text: title }), body, footer);
    // Cerrar tocando el fondo SOLO si el clic empieza y termina en el fondo (si no, arrastrar para seleccionar texto y soltar afuera cerraba todo),
    // y NUNCA en un cuadro con campos para escribir (se perderia lo escrito): ahi solo cierran Escape o «Cancelar».
    let bajoEnFondo = false;
    let sueltoEnFondo = false;
    const overlay = h("div", {
      class: "overlay",
      onpointerdown: (event) => { bajoEnFondo = event.target === overlay; },
      onpointerup: (event) => { sueltoEnFondo = event.target === overlay; },
      onclick: (event) => {
        const limpio = event.target === overlay && bajoEnFondo && sueltoEnFondo;
        bajoEnFondo = false;
        sueltoEnFondo = false;
        if (limpio && !dialog.querySelector("input, textarea, select")) close();
      },
    }, dialog);
    host.append(overlay);
    document.addEventListener("keydown", onKey);
    const first = dialog.querySelector("input, textarea, select, button");
    if (first) first.focus();
    return close;
  }

  function friendlyError(error) {
    const text = String((error && (error.message || error.detail)) || error || "");
    return text.replace(/^E_[A-Z]+:\s*/, "") || "No se pudo completar la accion.";
  }

  async function callAdmin(route, body) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("La sesion termino. Entra de nuevo.");
    let response;
    try {
      response = await fetch(cfg.adminFunctionUrl + route, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + session.access_token, "apikey": cfg.publishableKey },
        body: JSON.stringify(body),
      });
    } catch (_error) {
      throw new Error("No hay conexion con el servidor. Revisa el Internet.");
    }
    let data = null;
    try { data = await response.json(); } catch (_error) { data = null; }
    if (!response.ok) throw new Error(friendlyError((data && (data.detail || data.error)) || "Error " + response.status));
    return data;
  }

  const isAdmin = () => state.staff && state.staff.role === "admin";
  const adminOnly = (props) => (isAdmin() ? props : { ...props, disabled: true, title: "Solo el administrador puede hacerlo" });

  // ------------------------------------------------------------------------------------------ acceso
  async function loadStaff(userId) {
    const { data, error } = await sb.schema("socios").from("staff").select("role, status, login_name").eq("user_id", userId).maybeSingle();
    if (error || !data || data.status !== "activo") return null;
    return data;
  }

  async function showApp(user) {
    const staff = await loadStaff(user.id);
    if (!staff) {
      await sb.auth.signOut();
      showLogin("Esta cuenta no es del equipo de BoomArt.");
      return;
    }
    state.staff = staff;
    $("who-name").textContent = (staff.login_name || "") + (staff.role === "admin" ? "" : " (solo lectura)");
    $("view-login").hidden = true;
    $("view-app").hidden = false;
    refreshBadge();
    switchTab(state.tab);
  }

  function showLogin(message) {
    state.staff = null;
    $("view-app").hidden = true;
    $("view-login").hidden = false;
    const error = $("login-error");
    error.hidden = !message;
    error.textContent = message || "";
  }

  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = $("login-user").value.trim().toLowerCase();
    const pass = $("login-pass").value;
    const button = $("login-submit");
    if (!user || !pass) { showLogin("Escribe tu usuario y tu contraseña."); return; }
    button.disabled = true;
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email: user + "@" + cfg.loginDomain, password: pass });
      if (error || !data.user) { showLogin("Usuario o contraseña incorrectos."); return; }
      $("login-pass").value = "";
      await showApp(data.user);
    } finally { button.disabled = false; }
  });

  $("btn-logout").addEventListener("click", async () => { await sb.auth.signOut(); showLogin(""); });

  // ------------------------------------------------------------------------------------------ pestañas
  function switchTab(name) {
    state.tab = name;
    for (const tab of document.querySelectorAll(".tab")) tab.setAttribute("aria-selected", tab.dataset.tab === name ? "true" : "false");
    for (const panel of document.querySelectorAll(".panel")) panel.hidden = panel.id !== "t-" + name;
    if (name === "validar") renderValidar();
    else if (name === "vendedores") renderVendedores();
    else if (name === "productos") renderProductos();
    else renderRegistro();
  }
  for (const tab of document.querySelectorAll(".tab")) tab.addEventListener("click", () => switchTab(tab.dataset.tab));

  async function refreshBadge() {
    const { count } = await sb.from("products").select("id", { count: "exact", head: true }).eq("review_state", "en_validacion");
    const badge = $("badge-validar");
    badge.hidden = !count;
    badge.textContent = String(count || 0);
  }
  setInterval(() => { if (state.staff && !document.hidden) refreshBadge(); }, 60000);

  // ------------------------------------------------------------------------------------------ Para validar
  async function signedMap(paths) {
    const map = new Map();
    if (!paths.length) return map;
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
    for (const item of data || []) if (item.signedUrl) map.set(item.path, item.signedUrl);
    return map;
  }

  async function showBigPhoto(path) {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 600);
    if (error || !data) { toast("No se pudo abrir la foto.", true); return; }
    openDialog("Foto", h("img", { class: "big", src: data.signedUrl, alt: "Foto del producto" }), [{ label: "Cerrar" }], true);
  }

  function diffLines(row, snap) {
    if (!snap) return [];
    const lines = [];
    if (snap.title !== row.title) lines.push("Titulo publicado hoy: «" + snap.title + "»");
    if ((snap.description || "") !== (row.description || "")) lines.push("La descripcion cambio.");
    if (snap.section_id !== row.section_id || snap.collection_id !== row.collection_id) lines.push("La seccion o coleccion cambio.");
    const before = (snap.photos || []).map((p) => p.path).join("|");
    const after = (row.product_photos || []).map((p) => p.path).join("|");
    if (before !== after) lines.push("Las fotos cambiaron (antes " + (snap.photos || []).length + ", ahora " + (row.product_photos || []).length + ").");
    return lines;
  }

  function promptNote(title, intro, onSend) {
    const note = h("textarea", { maxlength: 450, "aria-label": "Mensaje para el vendedor", placeholder: "Ej.: Falta una foto del frente de la caja." });
    openDialog(title, h("div", { class: "form-grid" }, h("p", { class: "muted", text: intro }), note), [
      { label: "Cancelar" },
      { label: "Enviar", primary: true, keepOpen: true, run: async (close) => {
        const text = note.value.trim();
        if (text.length < 3) { toast("Escribe el motivo (al menos 3 letras).", true); return; }
        await onSend(text);
        close();
      } },
    ]);
  }

  async function runReview(ids, decision, note) {
    let okCount = 0;
    const problems = [];
    for (let i = 0; i < ids.length; i += REVIEW_CHUNK) {
      const chunk = ids.slice(i, i + REVIEW_CHUNK);
      toast("Procesando " + Math.min(i + REVIEW_CHUNK, ids.length) + " de " + ids.length + "…");
      // cada producto va con el `submitted_at` que se VIO en pantalla: si el vendedor lo cambio despues, la base lo rechaza
      const body = { items: chunk.map((id) => ({ product_id: id, submitted_at: state.stamps.get(id) })), decision };
      if (note) body.note = note;
      const data = await callAdmin("/products/review", body);
      for (const result of data.results || []) {
        if (result.error) problems.push((result.code || result.product_id.slice(0, 8)) + ": " + (result.detail || result.error));
        else okCount += 1;
      }
    }
    toast(decision === "publicar" ? okCount + " publicado(s)." : okCount + " devuelto(s) al vendedor.", false);
    if (problems.length) toast("Con problema: " + problems.join(" · "), true);
    refreshBadge();
    renderValidar();
  }

  async function renderValidar() {
    const root = $("t-validar");
    root.replaceChildren(h("p", { class: "muted", text: "Cargando…" }));
    const { data: rows, error } = await sb.from("products")
      .select("id, code, title, description, price, qty, show_qty, submitted_at, published_at, seller_id, section_id, collection_id, sellers(name), sections(name), collections(name), product_photos(id, position, path, thumb_path)")
      .eq("review_state", "en_validacion").order("submitted_at", { ascending: true }).order("position", { referencedTable: "product_photos" }).limit(200);
    if (error) { root.replaceChildren(h("p", { class: "error", text: "No se pudo cargar: " + friendlyError(error) })); return; }
    const products = rows || [];
    state.stamps = new Map(products.map((p) => [p.id, p.submitted_at]));
    const published = products.filter((p) => p.published_at).map((p) => p.id);
    const snaps = new Map();
    if (published.length) {
      const { data } = await sb.from("catalog").select("product_id, title, description, section_id, collection_id, photos").in("product_id", published);
      for (const snap of data || []) snaps.set(snap.product_id, snap);
    }
    const urls = await signedMap(products.flatMap((p) => (p.product_photos || []).map((ph) => ph.thumb_path)));

    const selected = new Set();
    const publishBtn = h("button", { class: "btn primary", type: "button", disabled: true, text: "Publicar marcados (0)" });
    const updateBtn = () => { publishBtn.textContent = "Publicar marcados (" + selected.size + ")"; publishBtn.disabled = !isAdmin() || selected.size === 0; };
    publishBtn.addEventListener("click", async () => {
      publishBtn.disabled = true;
      try { await runReview([...selected], "publicar"); } catch (e) { toast(friendlyError(e), true); updateBtn(); }
    });
    const allBox = h("input", { type: "checkbox", "aria-label": "Marcar todos", onchange: (event) => {
      for (const box of root.querySelectorAll("input[data-pid]")) { box.checked = event.target.checked; if (box.checked) selected.add(box.dataset.pid); else selected.delete(box.dataset.pid); }
      updateBtn();
    } });

    const head = h("div", { class: "panel-head" },
      h("div", {}, h("h2", { text: "Para validar" }), h("p", { class: "muted", text: products.length ? products.length + " producto(s) esperando tu revision." : "" })),
      h("div", { class: "toolbar" }, products.length ? h("label", { class: "check" }, allBox, "Marcar todos") : null, publishBtn,
        h("button", { class: "btn", type: "button", text: "Actualizar", onclick: () => { refreshBadge(); renderValidar(); } })));

    if (!products.length) { root.replaceChildren(head, h("div", { class: "empty", text: "No hay nada por validar. ¡Todo al dia!" })); return; }

    const cards = products.map((p) => {
      const isEdit = Boolean(p.published_at);
      const diffs = diffLines(p, snaps.get(p.id));
      const box = h("input", { type: "checkbox", "data-pid": p.id, "aria-label": "Marcar " + p.title, onchange: (event) => {
        if (event.target.checked) selected.add(p.id); else selected.delete(p.id);
        updateBtn();
      } });
      return h("article", { class: "card" },
        h("div", { class: "card-head" },
          h("label", { class: "check" }, box, h("span", { class: "card-title", text: p.title || "(sin nombre)" })),
          h("span", {}, h("span", { class: "pill " + (isEdit ? "warn" : "ok"), text: isEdit ? "Cambios de algo ya publicado" : "Producto nuevo" }))),
        h("div", { class: "meta" },
          h("span", { text: "Codigo " + p.code }), h("span", { text: (p.sellers && p.sellers.name) || "" }),
          h("span", { text: "Precio " + money(p.price) }), h("span", { text: "Cantidad " + p.qty + (p.show_qty ? " (se muestra)" : "") }),
          h("span", { text: [(p.sections && p.sections.name) || "Sin seccion", p.collections && p.collections.name].filter(Boolean).join(" › ") }),
          h("span", { text: "Enviado " + when(p.submitted_at) })),
        h("div", { class: "photos" }, (p.product_photos || []).map((ph) => h("button", { type: "button", "aria-label": "Ver foto grande", onclick: () => showBigPhoto(ph.path) },
          urls.get(ph.thumb_path) ? h("img", { src: urls.get(ph.thumb_path), alt: "Foto " + (ph.position + 1) }) : h("span", { class: "muted", text: "sin vista" })))),
        p.description ? h("p", { class: "desc", text: p.description }) : h("p", { class: "muted", text: "Sin descripcion." }),
        diffs.length ? h("div", { class: "diff" }, h("strong", { text: "Que cambio respecto a lo publicado:" }), diffs.map((line) => h("div", { text: "• " + line }))) : null,
        h("div", { class: "actions" },
          h("button", { ...adminOnly({ class: "btn primary", type: "button", text: "Publicar" }), onclick: async (event) => {
            event.currentTarget.disabled = true;
            try { await runReview([p.id], "publicar"); } catch (e) { toast(friendlyError(e), true); event.currentTarget.disabled = false; }
          } }),
          h("button", { ...adminOnly({ class: "btn", type: "button", text: "Pedir cambios" }), onclick: () =>
            promptNote("Pedir cambios", "El vendedor vera este mensaje en su portal.", (text) => runReview([p.id], "pedir_cambios", text)) }),
          h("button", { ...adminOnly({ class: "btn danger", type: "button", text: "Rechazar" }), onclick: () =>
            promptNote("Rechazar", "Explica por que no se publicara. El vendedor lo vera.", (text) => runReview([p.id], "rechazar", text)) })));
    });
    root.replaceChildren(head, ...cards);
  }

  // ------------------------------------------------------------------------------------------ Vendedores
  function showSecret(title, login, password) {
    const secret = h("div", { class: "secret", text: password });
    openDialog(title, h("div", { class: "form-grid" },
      h("p", { text: "Usuario: " }, h("strong", { text: login })),
      h("p", { text: "Clave (se muestra UNA sola vez; anotala o copiala ahora):" }), secret,
      h("p", { class: "muted", text: "Entregasela a su dueño en una tarjeta. Si la pierde, usa «Restablecer clave»." })), [
      { label: "Copiar clave", keepOpen: true, run: async () => {
        try { await navigator.clipboard.writeText(password); toast("Clave copiada."); } catch (_e) { toast("No se pudo copiar; seleccionala y copia a mano.", true); }
      } },
      { label: "Ya la guarde", primary: true },
    ]);
  }

  // El enlace y el WhatsApp se corrigen solos: «Random Figures» -> random-figures; «+51 925 666 542» -> 51925666542; «925666542» -> 51925666542.
  const limpiarEnlace = (valor) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 39);
  const limpiarWhatsapp = (valor) => {
    const digitos = valor.replace(/\D/g, "");
    return /^9\d{8}$/.test(digitos) ? "51" + digitos : digitos;
  };

  function newSellerDialog() {
    const fields = {
      name: h("input", { type: "text", maxlength: 80, placeholder: "Random Figures" }),
      slug: h("input", { type: "text", maxlength: 60, placeholder: "random-figures", spellcheck: "false", autocapitalize: "none" }),
      whatsapp: h("input", { type: "text", inputmode: "tel", maxlength: 25, placeholder: "51999999999" }),
      address: h("input", { type: "text", maxlength: 200, placeholder: "C.C. Arenales, pisos 1 y 5" }),
      hours: h("input", { type: "text", maxlength: 200, placeholder: "Lunes a sabado, 10:00 a 20:00" }),
      about: h("textarea", { maxlength: 500 }),
    };
    const aviso = h("p", { class: "error", role: "alert", hidden: true });
    const mostrar = (texto) => { aviso.textContent = texto; aviso.hidden = !texto; };
    fields.name.addEventListener("blur", () => { if (!fields.slug.value.trim()) fields.slug.value = limpiarEnlace(fields.name.value); });
    fields.slug.addEventListener("blur", () => { fields.slug.value = limpiarEnlace(fields.slug.value); });
    fields.whatsapp.addEventListener("blur", () => { fields.whatsapp.value = limpiarWhatsapp(fields.whatsapp.value); });
    const row = (label, node) => h("div", {}, h("label", { text: label }), node);
    openDialog("Nuevo vendedor", h("div", { class: "form-grid" },
      row("Nombre de la tienda", fields.name), row("Direccion corta para el enlace (se corrige sola: minusculas, numeros y guiones)", fields.slug),
      row("WhatsApp de ventas (con codigo de pais; se limpia solo)", fields.whatsapp), row("Direccion", fields.address), row("Horario", fields.hours), row("Sobre la tienda", fields.about), aviso), [
      { label: "Cancelar" },
      { label: "Crear vendedor", primary: true, keepOpen: true, run: async (close) => {
        mostrar("");
        const name = fields.name.value.trim();
        const slug = limpiarEnlace(fields.slug.value.trim() || name);
        const whatsapp = limpiarWhatsapp(fields.whatsapp.value);
        fields.slug.value = slug;
        fields.whatsapp.value = whatsapp;
        if (name.length < 2) { mostrar("Escribe el nombre de la tienda (al menos 2 letras)."); fields.name.focus(); return; }
        if (slug.length < 2) { mostrar("El enlace necesita al menos 2 letras o numeros."); fields.slug.focus(); return; }
        if (whatsapp && !/^[0-9]{9,15}$/.test(whatsapp)) { mostrar("El WhatsApp debe tener entre 9 y 15 digitos, con codigo de pais (ej. 51925666542)."); fields.whatsapp.focus(); return; }
        const body = { slug, name };
        if (whatsapp) body.whatsapp = whatsapp;
        for (const key of ["address", "hours", "about"]) if (fields[key].value.trim()) body[key] = fields[key].value.trim();
        try { await callAdmin("/sellers/create", body); toast("Vendedor creado."); close(); renderVendedores(); }
        catch (e) {   // el cuadro NO se cierra: lo escrito se conserva
          const texto = friendlyError(e);
          const claro = /choca con los datos existentes/.test(texto) ? "Ya existe una tienda con ese enlace. Escribe un enlace distinto." : texto;
          mostrar(claro);
          toast(claro, true);
        }
      } },
    ]);
  }

  async function renderVendedores() {
    const root = $("t-vendedores");
    root.replaceChildren(h("p", { class: "muted", text: "Cargando…" }));
    const [sellers, users, products] = await Promise.all([
      sb.from("sellers").select("id, slug, name, whatsapp, status").order("created_at"),
      sb.from("seller_users").select("seller_id, login_name, status"),
      sb.from("products").select("seller_id, review_state").limit(10000),
    ]);
    if (sellers.error) { root.replaceChildren(h("p", { class: "error", text: "No se pudo cargar: " + friendlyError(sellers.error) })); return; }
    const userBySeller = new Map((users.data || []).map((u) => [u.seller_id, u]));
    const counts = new Map();
    for (const p of products.data || []) {
      const c = counts.get(p.seller_id) || { total: 0, en_validacion: 0, aprobado: 0 };
      c.total += 1;
      if (p.review_state === "en_validacion") c.en_validacion += 1;
      if (p.review_state === "aprobado") c.aprobado += 1;
      counts.set(p.seller_id, c);
    }
    state.sellersCache = sellers.data || [];

    const rows = (sellers.data || []).map((s) => {
      const user = userBySeller.get(s.id);
      const c = counts.get(s.id) || { total: 0, en_validacion: 0, aprobado: 0 };
      const actions = [];
      if (!user) {
        actions.push(h("button", { ...adminOnly({ class: "btn small primary", type: "button", text: "Crear acceso" }), onclick: () => createAccessDialog(s) }));
      } else {
        actions.push(h("button", { ...adminOnly({ class: "btn small", type: "button", text: "Restablecer clave" }), onclick: () => resetDialog(s, user) }));
        actions.push(h("button", { ...adminOnly({ class: "btn small" + (user.status === "activo" ? " danger" : ""), type: "button", text: user.status === "activo" ? "Bloquear" : "Desbloquear" }),
          onclick: () => toggleBlock(s, user) }));
      }
      return h("tr", {},
        h("td", {}, h("strong", { text: s.name }), h("div", { class: "muted", text: s.slug + " · " + (s.whatsapp || "sin WhatsApp") })),
        h("td", {}, user ? [h("div", { text: user.login_name }), h("span", { class: "pill " + (user.status === "activo" ? "ok" : "bad"), text: user.status === "activo" ? "Activo" : "Bloqueado" })] : h("span", { class: "pill warn", text: "Sin acceso" })),
        h("td", { text: c.total + " en total · " + c.en_validacion + " por validar · " + c.aprobado + " publicados" }),
        h("td", {}, h("div", { class: "actions" }, actions)));
    });
    root.replaceChildren(
      h("div", { class: "panel-head" }, h("h2", { text: "Vendedores" }),
        h("button", { ...adminOnly({ class: "btn primary", type: "button", text: "Nuevo vendedor" }), onclick: newSellerDialog })),
      rows.length
        ? h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Tienda", "Acceso", "Productos", "Acciones"].map((t) => h("th", { text: t })))), h("tbody", {}, rows)))
        : h("div", { class: "empty", text: "Todavia no hay vendedores. Crea el primero." }));
  }

  function createAccessDialog(seller) {
    const login = h("input", { type: "text", maxlength: 40, placeholder: "marcos", spellcheck: "false", autocapitalize: "none", autocomplete: "off" });
    openDialog("Crear acceso para " + seller.name, h("div", { class: "form-grid" },
      h("label", { text: "Nombre de usuario (3 a 40: letras, numeros, punto, guion)" }), login,
      h("p", { class: "muted", text: "La clave la genera el sistema y se muestra una sola vez." })), [
      { label: "Cancelar" },
      { label: "Crear acceso", primary: true, keepOpen: true, run: async (close) => {
        try {
          const data = await callAdmin("/access/create", { seller_id: seller.id, login_name: login.value.trim().toLowerCase() });
          close(); showSecret("Acceso creado", data.login_name, data.password); renderVendedores();
        } catch (e) { toast(friendlyError(e), true); }
      } },
    ]);
  }

  function resetDialog(seller, user) {
    openDialog("Restablecer clave", h("p", { text: "Se generara una clave nueva para «" + user.login_name + "» (" + seller.name + "). La anterior dejara de servir." }), [
      { label: "Cancelar" },
      { label: "Restablecer", primary: true, keepOpen: true, run: async (close) => {
        try { const data = await callAdmin("/access/reset", { seller_id: seller.id }); close(); showSecret("Clave nueva", data.login_name, data.password); }
        catch (e) { toast(friendlyError(e), true); }
      } },
    ]);
  }

  async function toggleBlock(seller, user) {
    const blocking = user.status === "activo";
    openDialog(blocking ? "Bloquear acceso" : "Desbloquear acceso",
      h("p", { text: (blocking ? "«" + user.login_name + "» no podra entrar hasta que lo desbloquees." : "«" + user.login_name + "» podra volver a entrar.") }), [
      { label: "Cancelar" },
      { label: blocking ? "Bloquear" : "Desbloquear", primary: true, keepOpen: true, run: async (close) => {
        try { await callAdmin("/access/status", { seller_id: seller.id, blocked: blocking }); close(); toast(blocking ? "Acceso bloqueado." : "Acceso desbloqueado."); renderVendedores(); }
        catch (e) { toast(friendlyError(e), true); }
      } },
    ]);
  }

  // ------------------------------------------------------------------------------------------ Productos
  async function cleanupDialog() {
    let report;
    try { report = await callAdmin("/maintenance/cleanup", { dry_run: true }); } catch (e) { toast(friendlyError(e), true); return; }
    const total = report.public_orphans + report.private_orphans;
    const body = h("div", { class: "form-grid" },
      h("p", { text: "Fotos publicas de productos que ya no existen: " + report.public_orphans }),
      h("p", { text: "Fotos de borrador sin producto (de hace mas de un dia): " + report.private_orphans }),
      total ? h("p", { class: "muted", text: "Borrarlas libera espacio y evita que alguien siga viendo la foto de un producto borrado." }) : h("p", { text: "No hay nada que limpiar." }));
    openDialog("Limpiar fotos sin producto", body, total
      ? [{ label: "Cancelar" }, { label: "Borrar " + total + " archivo(s)", primary: true, keepOpen: true, run: async (close) => {
          try { const done = await callAdmin("/maintenance/cleanup", { dry_run: false }); close(); toast(done.removed + " archivo(s) borrado(s)."); } catch (e) { toast(friendlyError(e), true); }
        } }]
      : [{ label: "Cerrar" }]);
  }

  async function renderProductos() {
    const root = $("t-productos");
    if (!state.sellersCache.length) {
      const { data } = await sb.from("sellers").select("id, slug, name").order("created_at");
      state.sellersCache = data || [];
    }
    const sellerSel = h("select", { "aria-label": "Tienda" }, h("option", { value: "", text: "Todas las tiendas" }), state.sellersCache.map((s) => h("option", { value: s.id, text: s.name })));
    const stateSel = h("select", { "aria-label": "Estado" }, h("option", { value: "", text: "Todos los estados" }),
      Object.entries(STATE_LABEL).map(([value, label]) => h("option", { value, text: label })));
    const search = h("input", { type: "search", placeholder: "Buscar por nombre o codigo", "aria-label": "Buscar" });
    const results = h("div", {});
    const reload = () => { state.productsPage = 0; load(); };
    sellerSel.addEventListener("change", reload);
    stateSel.addEventListener("change", reload);
    search.addEventListener("keydown", (event) => { if (event.key === "Enter") reload(); });
    root.replaceChildren(h("div", { class: "panel-head" }, h("h2", { text: "Productos" }), h("div", { class: "toolbar" }, sellerSel, stateSel, search,
      h("button", { class: "btn", type: "button", text: "Buscar", onclick: reload }),
      h("button", { ...adminOnly({ class: "btn small", type: "button", text: "Limpiar fotos sin producto" }), onclick: cleanupDialog }))), results);

    async function load() {
      results.replaceChildren(h("p", { class: "muted", text: "Cargando…" }));
      const from = state.productsPage * PAGE_SIZE;
      let query = sb.from("products").select("id, code, title, review_state, price, qty, visible, admin_hidden, published_at, sellers(name)", { count: "exact" })
        .order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
      if (sellerSel.value) query = query.eq("seller_id", sellerSel.value);
      if (stateSel.value) query = query.eq("review_state", stateSel.value);
      const term = search.value.trim().replace(/[%*,()]/g, " ").trim();
      if (term) query = query.or("title.ilike.*" + term + "*,code.ilike.*" + term + "*");
      const { data, error, count } = await query;
      if (error) { results.replaceChildren(h("p", { class: "error", text: "No se pudo cargar: " + friendlyError(error) })); return; }
      if (!data.length) { results.replaceChildren(h("div", { class: "empty", text: "No hay productos con ese filtro." })); return; }
      const rows = data.map((p) => h("tr", {},
        h("td", { text: p.code }), h("td", {}, h("strong", { text: p.title || "(sin nombre)" })), h("td", { text: (p.sellers && p.sellers.name) || "" }),
        h("td", {}, h("span", { class: "pill " + (STATE_CLASS[p.review_state] || ""), text: STATE_LABEL[p.review_state] || p.review_state }),
          !p.visible ? h("div", { class: "muted", text: "Oculto por el vendedor" }) : null, p.admin_hidden ? h("div", { class: "pill bad", text: "Oculto por BoomArt" }) : null),
        h("td", { text: money(p.price) }), h("td", { text: String(p.qty) }),
        h("td", {}, h("button", { ...adminOnly({ class: "btn small" + (p.admin_hidden ? "" : " danger"), type: "button", text: p.admin_hidden ? "Mostrar" : "Ocultar" }), onclick: async (event) => {
          event.currentTarget.disabled = true;
          try { await callAdmin("/products/hide", { product_id: p.id, hidden: !p.admin_hidden }); toast(p.admin_hidden ? "Producto visible otra vez." : "Producto oculto."); load(); }
          catch (e) { toast(friendlyError(e), true); event.currentTarget.disabled = false; }
        } }))));
      const pages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));
      results.replaceChildren(
        h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Codigo", "Producto", "Tienda", "Estado", "Precio", "Cant.", ""].map((t) => h("th", { text: t })))), h("tbody", {}, rows))),
        h("div", { class: "toolbar" },
          h("button", { class: "btn small", type: "button", text: "← Anterior", disabled: state.productsPage === 0, onclick: () => { state.productsPage -= 1; load(); } }),
          h("span", { class: "muted", text: "Pagina " + (state.productsPage + 1) + " de " + pages + " · " + (count || 0) + " producto(s)" }),
          h("button", { class: "btn small", type: "button", text: "Siguiente →", disabled: state.productsPage + 1 >= pages, onclick: () => { state.productsPage += 1; load(); } })));
    }
    load();
  }

  // ------------------------------------------------------------------------------------------ Registro
  async function renderRegistro() {
    const root = $("t-registro");
    root.replaceChildren(h("p", { class: "muted", text: "Cargando…" }));
    const { data, error } = await sb.from("audit_log").select("id, at, actor_type, action, entity_type, detail").order("id", { ascending: false }).limit(100);
    if (error) { root.replaceChildren(h("p", { class: "error", text: "No se pudo cargar: " + friendlyError(error) })); return; }
    const rows = (data || []).map((r) => h("tr", {}, h("td", { text: when(r.at) }), h("td", { text: r.actor_type }), h("td", { text: r.action }), h("td", { text: r.entity_type }),
      h("td", { class: "muted", text: JSON.stringify(r.detail || {}).slice(0, 140) })));
    root.replaceChildren(h("div", { class: "panel-head" }, h("h2", { text: "Registro de cambios" }), h("span", { class: "muted", text: "Ultimos 100 movimientos" })),
      rows.length ? h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Cuando", "Quien", "Que", "Sobre", "Detalle"].map((t) => h("th", { text: t })))), h("tbody", {}, rows)))
        : h("div", { class: "empty", text: "Todavia no hay movimientos." }));
  }

  // ------------------------------------------------------------------------------------------ arranque
  sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") showLogin(""); });
  (async () => {
    const { data } = await sb.auth.getSession();
    if (data.session && data.session.user) await showApp(data.session.user);
    else showLogin("");
  })();
})();
