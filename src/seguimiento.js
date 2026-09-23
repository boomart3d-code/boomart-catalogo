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
  const headlineEl = document.querySelector("#trackerHeadline");
  const updatedEl = document.querySelector("#trackerUpdated");
  const stepsEl = document.querySelector("#trackerSteps");
  const shalomNoteEl = document.querySelector("#trackerShalomNote");
  const productsWrapEl = document.querySelector("#trackerProducts");
  const productsListEl = document.querySelector("#trackerProductsList");

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

  function renderSteps(metodo, etapaActual) {
    const steps = STEPS_BY_METODO[metodo] || STEPS_BY_METODO.local;
    const currentIndex = steps.indexOf(etapaActual);
    stepsEl.innerHTML = "";
    steps.forEach((code, index) => {
      const li = document.createElement("li");
      li.className = "tracker-step";
      if (currentIndex >= 0 && index < currentIndex) li.classList.add("is-done");
      if (index === currentIndex) li.classList.add("is-current");

      const dot = document.createElement("span");
      dot.className = "tracker-step__dot";
      dot.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.className = "tracker-step__label";
      label.textContent = ETAPAS[code] || code;
      if (code === "pintado") {
        const hint = document.createElement("small");
        hint.textContent = "Solo si tu pieza lleva pintado.";
        label.appendChild(hint);
      }

      li.appendChild(dot);
      li.appendChild(label);
      stepsEl.appendChild(li);
    });
  }

  function renderProducts(productos) {
    if (!Array.isArray(productos) || productos.length < 2) {
      productsWrapEl.hidden = true;
      return;
    }
    productsListEl.innerHTML = "";
    productos.forEach((p) => {
      const li = document.createElement("li");
      const nombre = document.createElement("span");
      nombre.textContent = (p && p.nombre) || "Producto";
      const etapa = document.createElement("span");
      etapa.className = "tracker-products__etapa";
      etapa.textContent = (p && ETAPAS[p.etapa]) || (p && p.etapa) || "";
      li.appendChild(nombre);
      li.appendChild(etapa);
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

    headlineEl.textContent = ETAPAS[data.etapa] || "Tu pedido está en proceso";
    updatedEl.textContent = data.actualizado_en
      ? `Última actualización: ${formatUpdated(data.actualizado_en)}`
      : "";
    renderSteps(data.metodo_envio, data.etapa);
    renderProducts(data.productos);
    shalomNoteEl.hidden = data.etapa !== "enviado_shalom";

    loadingEl.hidden = true;
    notFoundEl.hidden = true;
    contentEl.hidden = false;
  }

  init();
})();
