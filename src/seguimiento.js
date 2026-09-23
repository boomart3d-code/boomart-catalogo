/*
 * Seguimiento publico de pedidos (proyecto "seguimiento web de pedidos",
 * Etapa 5). Pagina standalone (seguimiento/index.html): NO usa el cliente
 * de Supabase ni ninguna clave -- solo hace un GET normal a la Edge
 * Function "seguimiento", que ya decide del lado del servidor que campos
 * son seguros de mostrar (nunca dinero, telefono, direccion ni la clave de
 * Shalom). Un token inventado, vencido o revocado da SIEMPRE el mismo
 * mensaje generico "ya no esta disponible" -- nunca se distingue el motivo,
 * a proposito, para no dar pistas de que existio una venta.
 */
(function () {
  "use strict";

  const FUNCTION_URL = "https://sasqusmvysbvqiggdmuj.supabase.co/functions/v1/seguimiento";

  const ETAPAS = {
    tomado: "Pedido recibido, en espera de producción",
    fabricacion: "En fabricación",
    postproduccion: "En postproducción",
    pintado: "En pintado",
    empaquetado: "En empaquetado",
    listo_envio: "Listo para envío",
    listo_recojo: "Listo para recojo",
    enviado_shalom: "Enviado por Shalom",
  };

  // Iconos por etapa (trazo simple, heredan color via currentColor) y check
  // de "listo" para los pasos ya cumplidos. Cadenas fijas definidas aca
  // mismo (no vienen de datos externos), por eso es seguro usarlas con
  // innerHTML.
  const ICONO_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
  const ICONOS = {
    tomado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/><path d="M9 10h6M9 14h6M9 18h3"/></svg>',
    fabricacion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="1"/><rect x="7" y="14" width="10" height="7"/></svg>',
    postproduccion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2-2 2.5-2.5z"/></svg>',
    pintado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="13" height="6" rx="1"/><path d="M8 10v4a2 2 0 002 2h1v4"/></svg>',
    empaquetado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
    listo_envio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="7" width="13" height="9"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>',
    listo_recojo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-7 9 7"/><path d="M5 9v10h14V9"/></svg>',
    enviado_shalom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="7" width="13" height="9"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>',
  };

  // Que pasos mostrar segun el metodo de envio -- local nunca muestra un
  // paso "enviado" aparte (es transitorio, se cierra casi al toque); Shalom
  // si, porque ahi el envio dura dias y el cliente quiere verlo.
  const STEPS_BY_METODO = {
    local: ["tomado", "fabricacion", "postproduccion", "pintado", "empaquetado", "listo_envio"],
    recojo: ["tomado", "fabricacion", "postproduccion", "pintado", "empaquetado", "listo_recojo"],
    shalom: ["tomado", "fabricacion", "postproduccion", "pintado", "empaquetado", "listo_envio", "enviado_shalom"],
  };

  const loadingEl = document.querySelector("#trackerLoading");
  const notFoundEl = document.querySelector("#trackerNotFound");
  const contentEl = document.querySelector("#trackerContent");
  const saludoEl = document.querySelector("#trackerSaludo");
  const headlineEl = document.querySelector("#trackerHeadline");
  const updatedEl = document.querySelector("#trackerUpdated");
  const stepsEl = document.querySelector("#trackerSteps");
  const shalomNoteEl = document.querySelector("#trackerShalomNote");
  const direccionWrapEl = document.querySelector("#trackerDireccion");
  const direccionTextoEl = document.querySelector("#trackerDireccionTexto");
  const productsWrapEl = document.querySelector("#trackerProducts");
  const productsListEl = document.querySelector("#trackerProductsList");
  const pagoWrapEl = document.querySelector("#trackerPago");
  const pagoTotalEl = document.querySelector("#trackerPagoTotal");
  const pagoAbonadoEl = document.querySelector("#trackerPagoAbonado");
  const pagoPendienteEl = document.querySelector("#trackerPagoPendiente");

  function showNotFound() {
    loadingEl.hidden = true;
    contentEl.hidden = true;
    notFoundEl.hidden = false;
  }

  function formatUpdated(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
    } catch (err) {
      return "";
    }
  }

  function money(value) {
    return `S/ ${Number(value || 0).toFixed(2)}`;
  }

  function renderSteps(metodo, etapaActual, pintadoAplica) {
    let steps = STEPS_BY_METODO[metodo] || STEPS_BY_METODO.local;
    // Si ninguna pieza del pedido lleva pintura, el paso "En pintado" se
    // omite del todo en vez de mostrar un texto de excepcion confuso.
    if (pintadoAplica === false) steps = steps.filter((code) => code !== "pintado");
    const currentIndex = steps.indexOf(etapaActual);
    stepsEl.innerHTML = "";
    steps.forEach((code, index) => {
      const li = document.createElement("li");
      li.className = "tracker-step";
      const done = currentIndex >= 0 && index < currentIndex;
      if (done) li.classList.add("is-done");
      if (index === currentIndex) li.classList.add("is-current");

      const dot = document.createElement("span");
      dot.className = "tracker-step__dot";
      dot.setAttribute("aria-hidden", "true");
      dot.innerHTML = done ? ICONO_CHECK : (ICONOS[code] || "");

      const label = document.createElement("span");
      label.className = "tracker-step__label";
      label.textContent = ETAPAS[code] || code;

      li.appendChild(dot);
      li.appendChild(label);
      stepsEl.appendChild(li);
    });
  }

  function renderProducts(productos) {
    if (!Array.isArray(productos) || productos.length < 1) {
      productsWrapEl.hidden = true;
      return;
    }
    productsListEl.innerHTML = "";
    productos.forEach((p) => {
      const li = document.createElement("li");
      li.className = "tracker-products__item";

      // Solo se agrega la foto si vino una URL https valida -- si el
      // producto no esta sincronizado con el catalogo web se omite, nunca
      // se inventa una imagen.
      const imagen = (p && typeof p.imagen === "string" && p.imagen.startsWith("https://")) ? p.imagen : "";
      if (imagen) {
        const img = document.createElement("img");
        img.className = "tracker-products__img";
        img.src = imagen;
        img.alt = "";
        img.loading = "lazy";
        li.appendChild(img);
      }

      const info = document.createElement("div");
      info.className = "tracker-products__info";
      const nombre = document.createElement("span");
      nombre.className = "tracker-products__nombre";
      nombre.textContent = (p && p.nombre) || "Producto";
      const etapa = document.createElement("span");
      etapa.className = "tracker-products__etapa";
      etapa.textContent = (p && ETAPAS[p.etapa]) || (p && p.etapa) || "";
      info.appendChild(nombre);
      info.appendChild(etapa);

      li.appendChild(info);
      productsListEl.appendChild(li);
    });
    productsWrapEl.hidden = false;
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const token = (params.get("t") || "").trim();
    if (!token) {
      showNotFound();
      return;
    }

    let data = null;
    try {
      const resp = await fetch(`${FUNCTION_URL}?t=${encodeURIComponent(token)}`, {
        headers: { Accept: "application/json" },
      });
      if (resp.ok) {
        data = await resp.json();
      }
    } catch (err) {
      // Sin conexion / Supabase no responde: mismo mensaje generico, no
      // distinguimos de "no disponible" para no confundir al cliente con
      // detalles tecnicos.
      data = null;
    }

    if (!data || data.disponible !== true) {
      showNotFound();
      return;
    }

    const nombreCliente = (data.nombre_cliente || "").trim();
    saludoEl.textContent = nombreCliente ? `Hola ${nombreCliente},` : "";
    saludoEl.hidden = !nombreCliente;

    headlineEl.textContent = ETAPAS[data.etapa] || "Tu pedido está en proceso";
    updatedEl.textContent = data.actualizado_en
      ? `Última actualización: ${formatUpdated(data.actualizado_en)}`
      : "";
    renderSteps(data.metodo_envio, data.etapa, data.pintado_aplica !== false);
    renderProducts(data.productos);
    shalomNoteEl.hidden = data.etapa !== "enviado_shalom";

    const precioTotal = Number(data.precio_total || 0);
    if (precioTotal > 0) {
      pagoTotalEl.textContent = money(data.precio_total);
      pagoAbonadoEl.textContent = money(data.precio_abonado);
      pagoPendienteEl.textContent = money(data.precio_pendiente);
      pagoWrapEl.hidden = false;
    } else {
      pagoWrapEl.hidden = true;
    }

    const direccionEnvio = (data.direccion_envio || "").trim();
    direccionTextoEl.textContent = direccionEnvio;
    direccionWrapEl.hidden = !direccionEnvio;

    loadingEl.hidden = true;
    notFoundEl.hidden = true;
    contentEl.hidden = false;
  }

  init();
})();
