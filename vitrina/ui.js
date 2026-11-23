/*
 * Piezas de interfaz reutilizables del portal de Marcos. Regla de seguridad: NUNCA se arma HTML con datos (sin innerHTML):
 * todo texto entra con textContent y los iconos se crean con createElementNS. La politica de contenido no admite codigo en linea.
 */
(function (root) {
  "use strict";
  const U = root.VitrinaUtil;
  const D = () => root.VitrinaDatos;
  const SVG = "http://www.w3.org/2000/svg";
  let secuencia = 0;
  const ESPERA_LENTA_MS = 10000;     // si un paso tarda mas que esto sin avanzar, se avisa que la conexion esta lenta

  // ---------------------------------------------------------------- crear elementos
  function h(etiqueta, props, ...hijos) {
    const el = document.createElement(etiqueta);
    for (const [clave, valor] of Object.entries(props || {})) {
      if (valor === false || valor === null || valor === undefined) continue;
      if (clave === "class") el.className = valor;
      else if (clave === "text") el.textContent = valor;
      else if (clave === "value") el.value = valor;
      else if (clave.startsWith("on") && typeof valor === "function") el.addEventListener(clave.slice(2), valor);
      else el.setAttribute(clave, valor === true ? "" : valor);
    }
    for (const hijo of hijos.flat()) {
      if (hijo === null || hijo === undefined || hijo === false) continue;
      el.append(hijo.nodeType ? hijo : document.createTextNode(String(hijo)));
    }
    return el;
  }

  function nuevoIdDom(prefijo) {
    secuencia += 1;
    return `${prefijo || "c"}-${secuencia}`;
  }

  // ---------------------------------------------------------------- iconos (trazo simple, un solo estilo)
  const ICONOS = {
    inicio: ["M3 11.5 12 4l9 7.5", "M5.5 10v10h13V10", "M10 20v-6h4v6"],
    publicar: [["circle", { cx: 12, cy: 12, r: 9 }], "M12 8v8M8 12h8"],
    stock: ["M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z", "M3 7.5 12 12l9-4.5M12 12v9"],
    productos: [["rect", { x: 3.5, y: 3.5, width: 7, height: 7, rx: 1.6 }], ["rect", { x: 13.5, y: 3.5, width: 7, height: 7, rx: 1.6 }], ["rect", { x: 3.5, y: 13.5, width: 7, height: 7, rx: 1.6 }], ["rect", { x: 13.5, y: 13.5, width: 7, height: 7, rx: 1.6 }]],
    mas: [["circle", { cx: 5, cy: 12, r: 1.9, fill: "currentColor" }], ["circle", { cx: 12, cy: 12, r: 1.9, fill: "currentColor" }], ["circle", { cx: 19, cy: 12, r: 1.9, fill: "currentColor" }]],
    camara: ["M4 8h3l1.6-2.5h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z", ["circle", { cx: 12, cy: 13, r: 3.5 }]],
    imagen: [["rect", { x: 3, y: 4, width: 18, height: 16, rx: 2 }], ["circle", { cx: 9, cy: 10, r: 1.6 }], "m4 18 5-5 4 4 3-3 4 4"],
    papelera: ["M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v6M14 11v6"],
    visto: ["m5 12.5 4.5 4.5L19 7.5"],
    cerrar: ["M6 6l12 12M18 6 6 18"],
    menos: ["M5 12h14"],
    mas_: ["M12 5v14M5 12h14"],
    ojo: ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", ["circle", { cx: 12, cy: 12, r: 3 }]],
    ojo_tachado: ["M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24", "M1 1l22 22"],
    buscar: [["circle", { cx: 11, cy: 11, r: 6.5 }], "m16 16 4.5 4.5"],
    atras: ["M15 5 8 12l7 7"],
    derecha: ["m9 5 7 7-7 7"],
    abajo: ["m5 9 7 7 7-7"],
    estrella: [["path", { d: "m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z", fill: "currentColor" }]],
    aviso: ["M12 4 2.5 20h19z", "M12 10v5M12 17.4v.1"],
    lapiz: ["M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"],
    carpeta: ["M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2.5h7.5A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z"],
    enviar: ["M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z"],
    salir: ["M9 4H5v16h4M16 8l4 4-4 4M20 12H9"],
    ayuda: [["circle", { cx: 12, cy: 12, r: 9 }], "M9.5 9.6a2.6 2.6 0 1 1 3.7 2.3c-.8.4-1.2 1-1.2 1.8M12 17v.2"],
    tienda: ["M4 9 5.5 4h13L20 9M4 9v11h16V9M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9M9.5 20v-5h5v5"],
    reintentar: ["M20 11a8 8 0 0 0-14.5-4M4 5v4h4M4 13a8 8 0 0 0 14.5 4M20 19v-4h-4"],
    candado: [["rect", { x: 5, y: 11, width: 14, height: 9, rx: 2 }], "M8 11V8a4 4 0 0 1 8 0v3"],
    celular: [["rect", { x: 6.5, y: 2.5, width: 11, height: 19, rx: 2.4 }], "M11 18.5h2"],
    descargar: ["M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"],
  };

  function icono(nombre, tam) {
    const lado = tam || 24;
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(lado));
    svg.setAttribute("height", String(lado));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    for (const parte of ICONOS[nombre] || []) {
      const hijo = typeof parte === "string" ? document.createElementNS(SVG, "path") : document.createElementNS(SVG, parte[0]);
      if (typeof parte === "string") hijo.setAttribute("d", parte);
      else for (const [k, v] of Object.entries(parte[1])) hijo.setAttribute(k, String(v));
      svg.append(hijo);
    }
    return svg;
  }

  // ---------------------------------------------------------------- avisos (toasts)
  function avisar(mensaje, tipo) {
    const contenedor = document.getElementById("avisos");
    if (!contenedor) return;
    const nodo = h("div", { class: `aviso${tipo ? ` aviso--${tipo}` : ""}`, role: tipo === "error" ? "alert" : "status" },
      h("span", { class: "aviso__texto", text: mensaje }),
      h("button", { class: "aviso__x", type: "button", "aria-label": "Cerrar aviso", onclick: () => nodo.remove() }, icono("cerrar", 20)));
    contenedor.append(nodo);
    setTimeout(() => nodo.remove(), tipo === "error" ? 10000 : 4500);
  }

  // ---------------------------------------------------------------- bloques de estado
  function cargando(texto) {
    return h("div", { class: "cargando", role: "status" }, h("span", { class: "rueda", "aria-hidden": "true" }), h("span", { text: texto || "Cargando…" }));
  }

  function vacio(titulo, texto, accion) {
    return h("div", { class: "vacio" }, h("strong", { text: titulo }), texto ? h("p", { text: texto }) : null, accion || null);
  }

  /** Mensaje de error con boton «Reintentar» (para cuando no se pudo cargar una pantalla). */
  function panelError(mensaje, reintentar) {
    return h("div", { class: "panel-error", role: "alert" },
      icono("aviso", 32), h("p", { text: mensaje }),
      reintentar ? h("button", { class: "btn btn--primario", type: "button", onclick: reintentar }, icono("reintentar", 22), "Reintentar") : null);
  }

  /** Corre `trabajo` con el boton ocupado (evita doble toque). Si falla, vuelve a dejar el boton listo y relanza el error. */
  async function trabajando(boton, textoEspera, trabajo) {
    const guardado = Array.from(boton.childNodes);
    boton.disabled = true;
    boton.setAttribute("aria-busy", "true");
    boton.replaceChildren(h("span", { class: "rueda rueda--chica", "aria-hidden": "true" }), textoEspera);
    try {
      return await trabajo();
    } finally {
      boton.disabled = false;
      boton.removeAttribute("aria-busy");
      boton.replaceChildren(...guardado);
    }
  }

  function retrasar(fn, ms) {
    let reloj = null;
    const llamada = (...args) => { clearTimeout(reloj); reloj = setTimeout(() => fn(...args), ms); };
    llamada.cancelar = () => clearTimeout(reloj);
    return llamada;
  }

  // ---------------------------------------------------------------- formularios
  function campo(etiqueta, control, ayuda) {
    if (!control.id) control.id = nuevoIdDom("campo");
    const idAyuda = ayuda ? `${control.id}-ayuda` : null;
    if (idAyuda) control.setAttribute("aria-describedby", idAyuda);
    return h("div", { class: "campo" },
      h("label", { class: "campo__etiqueta", for: control.id, text: etiqueta }),
      control,
      ayuda ? h("small", { class: "campo__ayuda", id: idAyuda, text: ayuda }) : null);
  }

  /** Interruptor grande con texto. Devuelve { el, input }. */
  function interruptor(texto, ayuda, valor, alCambiar) {
    const input = h("input", { type: "checkbox", role: "switch", class: "interruptor__input" });
    input.checked = !!valor;
    input.addEventListener("change", () => alCambiar && alCambiar(input.checked));
    const el = h("label", { class: "interruptor" },
      input, h("span", { class: "interruptor__pista", "aria-hidden": "true" }, h("span", { class: "interruptor__bola" })),
      h("span", { class: "interruptor__texto" }, h("strong", { text: texto }), ayuda ? h("small", { text: ayuda }) : null));
    return { el, input };
  }

  /** Cantidad con − y + grandes (y se puede escribir). Devuelve { el, leer, poner }. */
  function contador({ valor, min, max, etiqueta, alCambiar }) {
    const piso = min === undefined ? 0 : min;
    const tope = max === undefined ? 9999 : max;
    let actual = Math.min(tope, Math.max(piso, valor === undefined ? piso : valor));
    const campoNum = h("input", { class: "contador__num", type: "text", inputmode: "numeric", pattern: "[0-9]*", autocomplete: "off", "aria-label": etiqueta || "Cantidad" });
    const menos = h("button", { class: "contador__btn", type: "button", "aria-label": `Una menos${etiqueta ? ` · ${etiqueta}` : ""}` }, icono("menos", 28));
    const mas = h("button", { class: "contador__btn", type: "button", "aria-label": `Una más${etiqueta ? ` · ${etiqueta}` : ""}` }, icono("mas_", 28));
    function pintar() {
      campoNum.value = String(actual);
      menos.disabled = actual <= piso;
      mas.disabled = actual >= tope;
    }
    function poner(n, avisarCambio) {
      const nuevo = Math.min(tope, Math.max(piso, n));
      const cambio = nuevo !== actual;
      actual = nuevo;
      pintar();
      if (cambio && avisarCambio !== false && alCambiar) alCambiar(actual);
    }
    menos.addEventListener("click", () => poner(actual - 1));
    mas.addEventListener("click", () => poner(actual + 1));
    campoNum.addEventListener("input", () => {
      const limpio = campoNum.value.replace(/[^0-9]/g, "").slice(0, 6);
      if (limpio !== campoNum.value) campoNum.value = limpio;
      const n = U.parseEntero(limpio, piso, tope);
      if (n !== null && n !== actual) { actual = n; menos.disabled = actual <= piso; mas.disabled = actual >= tope; if (alCambiar) alCambiar(actual); }
    });
    campoNum.addEventListener("focus", () => campoNum.select());
    campoNum.addEventListener("blur", () => {
      const n = U.parseEntero(campoNum.value, piso, tope);
      if (n === null) poner(campoNum.value === "" ? piso : (Number(campoNum.value) > tope ? tope : actual)); else poner(n);
      pintar();
    });
    pintar();
    return { el: h("div", { class: "contador" }, menos, campoNum, mas), leer: () => actual, poner, input: campoNum };
  }

  // ---------------------------------------------------------------- hojas (dialogos)
  /** Abre una hoja modal. `construir(cerrar, dlg)` devuelve el contenido. La promesa trae lo que pasen a cerrar(valor), o undefined si se cancela. */
  function abrirHoja(construir, opciones) {
    const opts = opciones || {};
    return new Promise((resolver) => {
      const dlg = h("dialog", { class: `hoja${opts.ancha ? " hoja--ancha" : ""}${opts.completa ? " hoja--completa" : ""}`, "aria-label": opts.etiqueta || "Ventana" });
      let valor;
      const bloqueada = () => !!(opts.bloqueo && opts.bloqueo.activo);      // mientras guarda, no se puede cerrar por accidente
      const cerrar = (v) => { valor = v; if (dlg.open) dlg.close(); };
      dlg.addEventListener("close", () => { document.body.classList.remove("con-hoja"); dlg.remove(); resolver(valor); });
      dlg.addEventListener("cancel", (e) => { if (bloqueada()) { e.preventDefault(); return; } valor = undefined; });
      // Tocar fuera cierra SOLO si el toque empieza y termina en el fondo: arrastrar para seleccionar lo escrito y soltar afuera
      // cerraba la hoja y borraba lo escrito. Una hoja con campos para escribir nunca se cierra tocando afuera.
      let bajoFuera = false;
      let sueltoFuera = false;
      dlg.addEventListener("pointerdown", (e) => { bajoFuera = e.target === dlg; });
      dlg.addEventListener("pointerup", (e) => { sueltoFuera = e.target === dlg; });
      dlg.addEventListener("click", (e) => {
        const limpio = e.target === dlg && bajoFuera && sueltoFuera;
        bajoFuera = false;
        sueltoFuera = false;
        if (limpio && opts.cerrarAlTocarFuera !== false && !bloqueada() && !dlg.querySelector("input, textarea, select")) cerrar(undefined);
      });
      dlg.append(...[].concat(construir(cerrar, dlg)).filter(Boolean));
      document.body.append(dlg);
      document.body.classList.add("con-hoja");
      dlg.showModal();
    });
  }

  /** Pregunta si/no. Devuelve true si confirma. El foco empieza en «No» para evitar toques sin querer. */
  function confirmar({ titulo, texto, si, no, peligro, detalle }) {
    return abrirHoja((cerrar) => [
      h("h2", { class: "hoja__titulo", text: titulo }),
      texto ? h("p", { class: "hoja__texto", text: texto }) : null,
      detalle ? h("p", { class: "hoja__detalle", text: detalle }) : null,
      h("div", { class: "hoja__botones" },
        h("button", { class: "btn btn--claro", type: "button", autofocus: true, onclick: () => cerrar(false), text: no || "No, volver" }),
        h("button", { class: `btn ${peligro ? "btn--peligro" : "btn--primario"}`, type: "button", onclick: () => cerrar(true), text: si || "Sí" })),
    ], { etiqueta: titulo }).then((r) => r === true);
  }

  function informar({ titulo, texto, boton }) {
    return abrirHoja((cerrar) => [
      h("h2", { class: "hoja__titulo", text: titulo }),
      texto ? h("p", { class: "hoja__texto", text: texto }) : null,
      h("div", { class: "hoja__botones hoja__botones--uno" }, h("button", { class: "btn btn--primario", type: "button", autofocus: true, onclick: () => cerrar(true), text: boton || "Entendido" })),
    ], { etiqueta: titulo });
  }

  /**
   * Hoja de «Guardando…» que no se puede cerrar por accidente. `trabajo(avance)` hace el trabajo y llama avance("texto") para mostrar
   * en que va. Si falla, muestra el error con «Reintentar» (el trabajo debe poder repetirse: continua donde se quedo) y «Cerrar».
   * Devuelve { ok: true, valor } | { ok: false, error, sesion? }.
   */
  function conProgreso({ titulo, trabajo, contexto, textoInicial }) {
    return new Promise((resolver) => {
      const bloqueo = { activo: true };
      let cerrarHoja = () => {};
      const tituloEl = h("h2", { class: "hoja__titulo", text: titulo });
      const estado = h("p", { class: "hoja__texto", role: "status", text: textoInicial || "" });
      const rueda = h("span", { class: "rueda rueda--grande", "aria-hidden": "true" });
      const error = h("div", { class: "hoja__error", hidden: true });
      const botones = h("div", { class: "hoja__botones", hidden: true });
      // Avance: barra y «3 de 13» (solo si el trabajo informa su avance) y un aviso si un paso tarda demasiado.
      const barra = h("progress", { class: "hoja__avance", max: "100", "aria-label": "Avance", hidden: true });
      barra.value = 0;
      const cuenta = h("p", { class: "hoja__cuenta", "aria-hidden": "true", hidden: true });
      const lento = h("p", { class: "hoja__lento", role: "status", hidden: true, text: "La conexión está lenta. Sigue esperando y no cierres esta pantalla: no se pierde nada." });
      abrirHoja((cerrar) => { cerrarHoja = cerrar; return [tituloEl, h("div", { class: "hoja__espera" }, rueda, estado), barra, cuenta, lento, error, botones]; }, { bloqueo, etiqueta: titulo });

      let reloj = null;
      const vigilar = () => { clearTimeout(reloj); lento.hidden = true; reloj = setTimeout(() => { lento.hidden = false; }, ESPERA_LENTA_MS); };
      const dejarDeVigilar = () => { clearTimeout(reloj); lento.hidden = true; };
      const avance = (texto) => { estado.textContent = texto; vigilar(); };
      avance.progreso = (hechos, total) => {
        if (!(total > 0)) return;
        barra.hidden = false; cuenta.hidden = false;
        barra.value = Math.round((hechos / total) * 100);
        cuenta.textContent = `${Math.min(hechos, total)} de ${total} pasos`;
      };

      async function intentar() {
        bloqueo.activo = true; botones.hidden = true; error.hidden = true; rueda.hidden = false; tituloEl.textContent = titulo;
        barra.hidden = true; cuenta.hidden = true; vigilar();
        try {
          const valor = await trabajo(avance);
          dejarDeVigilar();
          bloqueo.activo = false;
          cerrarHoja();
          resolver({ ok: true, valor });
        } catch (err) {
          dejarDeVigilar();
          bloqueo.activo = false;
          const app = root.VitrinaApp;
          if (app && app.esErrorDeSesion(err)) { cerrarHoja(); resolver({ ok: false, error: err, sesion: true }); return; }
          tituloEl.textContent = "No se pudo terminar";
          barra.hidden = true; cuenta.hidden = true;
          rueda.hidden = true;
          estado.textContent = "";
          error.hidden = false;
          error.replaceChildren(
            h("p", { class: "error", text: U.mensajeAmable(err, contexto) }),
            h("p", { class: "hoja__texto", text: "Lo que ya se subió se conserva. Al reintentar solo se hace lo que falta." }));
          botones.replaceChildren(
            h("button", { class: "btn btn--claro", type: "button", onclick: () => { cerrarHoja(); resolver({ ok: false, error: err }); }, text: "Cerrar" }),
            h("button", { class: "btn btn--primario", type: "button", autofocus: true, onclick: intentar }, icono("reintentar", 22), "Reintentar"));
          botones.hidden = false;
        }
      }
      intentar();
    });
  }

  /**
   * Hoja con un solo campo de texto (crear o renombrar una categoria).
   * `alGuardar(texto)` puede ser asincrona: si lanza un error, se muestra dentro de la hoja y no se cierra.
   */
  function formularioTexto({ titulo, etiqueta, valor, ejemplo, ayuda, boton, maximo, alGuardar, duplicado }) {
    return abrirHoja((cerrar) => {
      const entrada = h("input", { class: "entrada", type: "text", maxlength: String(maximo || 60), autocomplete: "off", autocapitalize: "sentences", placeholder: ejemplo || "", value: valor || "", enterkeyhint: "done" });
      const error = h("p", { class: "error", role: "alert", hidden: true });
      const guardar = h("button", { class: "btn btn--primario", type: "submit", text: boton || "Guardar" });
      const form = h("form", { class: "hoja__form", novalidate: true },
        h("h2", { class: "hoja__titulo", text: titulo }),
        campo(etiqueta, entrada, ayuda), error,
        h("div", { class: "hoja__botones" },
          h("button", { class: "btn btn--claro", type: "button", onclick: () => cerrar(undefined), text: "Cancelar" }), guardar));
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const texto = entrada.value.trim();
        error.hidden = true;
        if (!texto) { error.textContent = "Escribe un nombre."; error.hidden = false; entrada.focus(); return; }
        try {
          const resultado = await trabajando(guardar, "Guardando…", () => alGuardar(texto));
          cerrar(resultado === undefined ? texto : resultado);
        } catch (err) {
          error.textContent = U.mensajeAmable(err, { duplicado });
          error.hidden = false;
        }
      });
      setTimeout(() => entrada.focus(), 30);
      return [form];
    }, { etiqueta: titulo });
  }

  /**
   * Lista GRANDE con buscador para elegir (seccion o coleccion), con «+ Crear nueva» y sugerencias contra duplicados.
   * Devuelve { id, opcion } (id null = «ninguna») o undefined si se cancela.
   */
  function elegir({ titulo, opciones, seleccionado, ninguno, crear, vacio: textoVacio }) {
    return abrirHoja((cerrar, dlg) => {
      let lista = opciones.slice();
      const buscador = h("input", { class: "entrada entrada--buscar", type: "search", placeholder: "Buscar…", "aria-label": "Buscar en la lista", autocomplete: "off", enterkeyhint: "search" });
      const zonaLista = h("div", { class: "elegir__lista", role: "listbox", "aria-label": titulo });
      const zonaCrear = h("div", { class: "elegir__crear" });
      const contenedor = h("div", { class: "elegir" });

      function filaOpcion(id, nombre, detalle, marcada) {
        return h("button", { class: `elegir__opcion${marcada ? " es-marcada" : ""}`, type: "button", role: "option", "aria-selected": marcada ? "true" : "false",
          onclick: () => cerrar({ id, opcion: id === null ? null : lista.find((o) => o.id === id) || opciones.find((o) => o.id === id) }) },
        h("span", { class: "elegir__nombre", text: nombre }), detalle ? h("small", { text: detalle }) : null, marcada ? icono("visto", 24) : null);
      }

      function pintarLista() {
        const buscado = U.normalizarNombre(buscador.value);
        const visibles = buscado ? lista.filter((o) => U.normalizarNombre(o.nombre).includes(buscado)) : lista;
        const filas = [];
        if (ninguno && !buscado) filas.push(filaOpcion(null, ninguno, null, seleccionado === null || seleccionado === undefined));
        for (const o of visibles) filas.push(filaOpcion(o.id, o.nombre, o.detalle, o.id === seleccionado));
        if (!visibles.length) {
          filas.push(h("p", { class: "elegir__vacio", text: buscado ? `No hay nada que se llame «${buscador.value.trim()}».` : (textoVacio || "Todavía no hay nada aquí.") }));
        }
        zonaLista.replaceChildren(...filas);
      }

      function pintarBotonCrear() {
        zonaCrear.replaceChildren();
        if (!crear) return;
        zonaCrear.append(h("button", { class: "btn btn--claro btn--bloque", type: "button", onclick: abrirCrear, text: crear.etiqueta }));
      }

      function abrirCrear() {
        const entrada = h("input", { class: "entrada", type: "text", maxlength: "60", autocomplete: "off", autocapitalize: "sentences", placeholder: crear.ejemplo || "", enterkeyhint: "done" });
        const parecidos = h("div", { class: "elegir__parecidos", "aria-live": "polite" });
        const error = h("p", { class: "error", role: "alert", hidden: true });
        const botonCrear = h("button", { class: "btn btn--primario", type: "submit", text: "Crear" });
        const form = h("form", { class: "elegir__formulario", novalidate: true },
          h("h3", { text: crear.titulo }),
          campo("Nombre", entrada, crear.ayuda), parecidos, error,
          h("div", { class: "hoja__botones" }, h("button", { class: "btn btn--claro", type: "button", onclick: volver, text: "Volver" }), botonCrear));
        entrada.addEventListener("input", () => {
          error.hidden = true;
          const sugeridos = U.nombresParecidos(entrada.value, opciones.map((o) => ({ id: o.id, nombre: o.nombre })), 3);
          parecidos.replaceChildren(...(sugeridos.length ? [
            h("p", { class: "elegir__aviso", text: "Ya tienes algo parecido. Toca para usarlo y no repetirlo:" }),
            ...sugeridos.map((s) => h("button", { class: "btn btn--claro btn--bloque", type: "button", onclick: () => cerrar({ id: s.id, opcion: opciones.find((o) => o.id === s.id) }), text: s.nombre })),
          ] : []));
        });
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const nombre = entrada.value.trim();
          if (!nombre) { error.textContent = "Escribe el nombre."; error.hidden = false; entrada.focus(); return; }
          const igual = opciones.find((o) => U.normalizarNombre(o.nombre) === U.normalizarNombre(nombre));
          if (igual) { avisar(`Ya tenías «${igual.nombre}». La elegimos por ti.`); cerrar({ id: igual.id, opcion: igual }); return; }
          try {
            const creada = await trabajando(botonCrear, "Creando…", () => crear.alCrear(nombre));
            cerrar({ id: creada.id, opcion: creada, nueva: true });
          } catch (err) {
            error.textContent = U.mensajeAmable(err, { duplicado: crear.duplicado });
            error.hidden = false;
          }
        });
        contenedor.replaceChildren(form);
        setTimeout(() => entrada.focus(), 30);
      }

      function volver() {
        contenedor.replaceChildren(cabecera, ...(opciones.length > 6 || buscador.value ? [h("div", { class: "elegir__buscar" }, icono("buscar", 22), buscador)] : []), zonaLista, zonaCrear);
        pintarLista();
        pintarBotonCrear();
      }

      const cabecera = h("div", { class: "elegir__cabecera" },
        h("h2", { class: "hoja__titulo", text: titulo }),
        h("button", { class: "btn btn--icono", type: "button", "aria-label": "Cerrar", onclick: () => cerrar(undefined) }, icono("cerrar", 26)));
      buscador.addEventListener("input", pintarLista);
      volver();
      if (!opciones.length && crear) setTimeout(abrirCrear, 0);
      else setTimeout(() => { if (opciones.length > 6) buscador.focus(); }, 30);
      return [contenedor];
    }, { etiqueta: titulo, completa: true });
  }

  // ---------------------------------------------------------------- miniaturas (direcciones firmadas en lote)
  /** Recuadro de foto; se llena despues con `cargarMiniaturas`. `ruta` es la ruta en Storage (privada). */
  function miniatura(ruta, clase) {
    return h("div", { class: `miniatura ${clase || ""}`.trim(), "data-ruta": ruta || null }, h("span", { class: "miniatura__vacia" }, icono("imagen", 28), ruta ? null : h("small", { text: "Sin foto" })));
  }

  async function cargarMiniaturas(raiz) {
    const nodos = Array.from(raiz.querySelectorAll("[data-ruta]")).filter((n) => !n.dataset.lista);
    if (!nodos.length) return;
    const mapa = await D().urlsFirmadas(nodos.map((n) => n.dataset.ruta));
    for (const nodo of nodos) {
      const url = mapa[nodo.dataset.ruta];
      if (!url || !nodo.isConnected) continue;
      nodo.dataset.lista = "1";
      const img = h("img", { alt: "", decoding: "async", loading: "lazy", referrerpolicy: "no-referrer" });
      img.addEventListener("load", () => { nodo.classList.add("miniatura--lista"); const vacia = nodo.querySelector(".miniatura__vacia"); if (vacia) vacia.remove(); });
      img.addEventListener("error", () => img.remove());
      img.src = url;
      nodo.append(img);
    }
  }

  root.VitrinaUI = {
    h, icono, avisar, cargando, vacio, panelError, trabajando, retrasar, campo, interruptor, contador,
    abrirHoja, confirmar, informar, conProgreso, formularioTexto, elegir, miniatura, cargarMiniaturas, nuevoIdDom,
  };
})(window);
