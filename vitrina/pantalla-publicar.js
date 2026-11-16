/*
 * Pantalla «Publicar un producto»: asistente de 4 pasos (fotos, que es, precio y cantidad, descripcion y guardar) y pantalla de exito.
 * Lo que Marcos va escribiendo se guarda en su celular (borrador.js) en cada paso: si se corta internet, si el navegador recarga la
 * pagina al volver de la camara o si cierra la pestana, al volver sigue donde iba. Al guardar se reintenta solo lo que falta.
 */
(function (root) {
  "use strict";
  const App = root.VitrinaApp;
  const U = root.VitrinaUtil;
  const D = root.VitrinaDatos;
  const UI = root.VitrinaUI;
  const F = root.VitrinaFotos;
  const B = root.VitrinaBorrador;
  const { h, icono, avisar } = UI;

  const TITULOS = ["", "Las fotos", "¿Qué es?", "Precio y cantidad", "Descripción y guardar"];
  let borrador = null;     // el producto que se esta publicando ahora
  let ultimo = null;       // el ultimo que se guardo (para la pantalla de exito)

  // ---------------------------------------------------------------- borrador en memoria y en el celular
  function nuevoBorrador(base) {
    const b = base || {};
    return {
      vendedorId: App.tienda.id, productoId: U.nuevoId(), paso: 1, titulo: "",
      seccionId: b.seccionId || null, coleccionId: b.coleccionId || null, precio: b.precio || "",
      cantidad: b.cantidad === undefined ? 1 : b.cantidad, mostrarCant: !!b.mostrarCant, descripcion: b.descripcion || "",
      fotos: [], quitados: [], guardado: { producto: false }, restaurado: false, copiado: !!base,
    };
  }

  const metaFoto = (f) => ({ id: f.id, ext: f.ext, mime: f.mime, bytes: f.bytes, hecho: f.hecho, posicion: f.posicion });

  function tieneContenido(b) {
    return !!(b.titulo.trim() || b.precio || b.descripcion.trim() || b.fotos.length || b.seccionId || b.guardado.producto);
  }

  function persistirYa() {
    if (!borrador) return;
    const b = borrador;
    B.guardarCampos(b.vendedorId, {
      productoId: b.productoId, paso: b.paso, titulo: b.titulo, seccionId: b.seccionId, coleccionId: b.coleccionId, precio: b.precio,
      cantidad: b.cantidad, mostrarCant: b.mostrarCant, descripcion: b.descripcion, guardado: b.guardado,
      fotos: b.fotos.map(metaFoto), quitados: b.quitados.map(metaFoto),
    });
  }
  const persistir = UI.retrasar(persistirYa, 350);

  async function asegurarBorrador() {
    if (borrador && borrador.vendedorId === App.tienda.id) return;
    borrador = null;
    const guardado = await B.leer(App.tienda.id);
    if (guardado) {
      const d = guardado.datos;
      const fotos = guardado.fotos.map((f) => ({
        id: f.id, remoto: false, blob: f.blob, thumb: f.thumb, mime: f.mime, ext: f.ext, bytes: f.bytes, vista: URL.createObjectURL(f.blob),
        posicion: f.posicion === undefined ? null : f.posicion, hecho: f.hecho || { archivo: false, mini: false, fila: false },
      }));
      const candidato = {
        vendedorId: App.tienda.id, productoId: d.productoId || U.nuevoId(), paso: Math.min(4, Math.max(1, Number(d.paso) || 1)),
        titulo: d.titulo || "", seccionId: d.seccionId || null, coleccionId: d.coleccionId || null, precio: d.precio || "",
        cantidad: Number.isInteger(d.cantidad) ? d.cantidad : 1, mostrarCant: !!d.mostrarCant, descripcion: d.descripcion || "",
        fotos, quitados: (d.quitados || []).map((q) => ({ ...q, remoto: false })), guardado: d.guardado || { producto: false }, restaurado: true, copiado: false,
      };
      if (tieneContenido(candidato)) { borrador = candidato; return; }
    }
    borrador = nuevoBorrador();
  }

  async function descartarBorrador(base) {
    if (borrador) F.liberar(borrador.fotos);
    await B.borrar(App.tienda.id);
    borrador = nuevoBorrador(base);
  }

  let ultimoAvance = null;     // { desde, hasta }: para que «Atrás» use el historial del celular cuando se llegó con «Siguiente»

  function ir(paso) {
    if (paso === borrador.paso + 1) ultimoAvance = { desde: borrador.paso, hasta: paso };
    borrador.paso = paso;
    persistirYa();
    App.ir(`#/publicar/${paso}`);
  }

  /** «Atrás» dentro del asistente: si se llego desde ese paso con «Siguiente», vuelve en el historial (asi el boton atras del celular y este coinciden). */
  function volver(paso) {
    if (ultimoAvance && ultimoAvance.hasta === borrador.paso && ultimoAvance.desde === paso) {
      ultimoAvance = null;
      borrador.paso = paso;
      persistirYa();
      history.back();
      return;
    }
    ir(paso);
  }

  // ---------------------------------------------------------------- piezas
  function encabezadoPasos(paso) {
    const segmentos = [1, 2, 3, 4].map((n) => h("span", { class: `progreso__tramo${n <= paso ? " es-hecho" : ""}${n === paso ? " es-actual" : ""}` }));
    return h("div", { class: "progreso", role: "group", "aria-label": `Paso ${paso} de 4` },
      h("p", { class: "progreso__texto" }, h("strong", { text: `Paso ${paso} de 4` }), ` · ${TITULOS[paso]}`),
      h("div", { class: "progreso__barra", "aria-hidden": "true" }, segmentos));
  }

  function barraDeAcciones(izquierda, derecha) {
    return h("div", { class: "barra-pasos" }, h("div", { class: "barra-pasos__interior" }, izquierda, derecha));
  }

  function selector(etiqueta, texto, vacio, alTocar, deshabilitado, ayuda) {
    const boton = h("button", { class: "selector", type: "button", disabled: deshabilitado || null, "aria-haspopup": "dialog", onclick: alTocar },
      h("span", { class: texto ? "selector__valor" : "selector__vacio", text: texto || vacio }), icono("abajo", 26));
    return UI.campo(etiqueta, boton, ayuda);
  }

  const nombreDe = (lista, id) => { const x = lista.find((e) => e.id === id); return x ? x.name : ""; };

  function errorEnLinea(texto) {
    return h("p", { class: "error", role: "alert", text: texto });
  }

  /** Muestra los avisos arriba (donde se ven aunque la barra de botones tape el final) y lleva el foco al primer campo que falta. */
  function mostrarFaltas(contenedor, faltan) {
    contenedor.replaceChildren(...faltan.map(([texto]) => errorEnLinea(texto)));
    if (!faltan.length) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    faltan[0][1].focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- paso 1: fotos
  function paso1(zona) {
    const b = borrador;
    const grilla = F.cuadricula({
      items: b.fotos, quitados: b.quitados,
      alCambiar: (tipo, foto) => {
        if (tipo === "agregar") B.guardarFoto(b.vendedorId, foto);
        if (tipo === "quitar") B.quitarFoto(b.vendedorId, foto.id);
        persistirYa();
        pintarExtras();
      },
    });
    const extras = h("div", { class: "extras" });
    function pintarExtras() {
      extras.replaceChildren(...(tieneContenido(b) ? [h("button", { class: "btn btn--texto", type: "button", onclick: empezarDeNuevo }, icono("reintentar", 20), "Empezar de nuevo")] : []));
    }
    async function empezarDeNuevo() {
      const seguro = await UI.confirmar({
        titulo: "¿Empezar de nuevo?", texto: "Se borra lo que llevas de este producto: las fotos, el nombre y los demás datos.",
        detalle: b.guardado.producto ? "Una parte ya se había guardado: la encontrarás en «Mis productos» como «Sin enviar»." : null,
        si: "Sí, empezar de nuevo", no: "No, seguir con este", peligro: true,
      });
      if (!seguro) return;
      await descartarBorrador();
      App.ir("#/publicar/1", { reemplazar: true });
    }
    const avisoRetomado = b.restaurado && tieneContenido(b)
      ? h("div", { class: "nota" }, icono("candado", 22), h("p", { text: "Retomaste el producto que dejaste a medias. No se perdió nada." })) : null;
    const avisoCopia = b.copiado && !b.fotos.length
      ? h("div", { class: "nota" }, icono("visto", 22), h("p", { text: "Copiamos la sección, la colección, el precio y la descripción del anterior. Solo faltan las fotos nuevas y el nombre." })) : null;
    pintarExtras();
    zona.append(
      h("h1", { text: TITULOS[1] }),
      h("p", { class: "subtitulo", text: "Toca un cuadro para sacar la foto con la cámara o elegirla de tu galería." }),
      ...[avisoRetomado, avisoCopia].filter(Boolean), grilla.el, extras);
    return {
      siguiente: async () => {
        if (b.fotos.length) { ir(2); return; }
        const poner = await UI.confirmar({
          titulo: "Todavía no pusiste fotos", texto: "Sin foto no podrás mandar este producto a BoomArt para que lo publique. Puedes agregarla después.",
          si: "Poner una foto", no: "Seguir sin foto",
        });
        if (!poner) ir(2);
      },
      atras: { texto: "Salir", icono: "salir", accion: () => App.ir("#/inicio") },
    };
  }

  // ---------------------------------------------------------------- paso 2: que es
  async function paso2(zona, repintar) {
    const b = borrador;
    const cat = await App.cargarCategorias();
    if (b.seccionId && !cat.secciones.some((s) => s.id === b.seccionId)) { b.seccionId = null; b.coleccionId = null; }
    if (b.coleccionId && !cat.colecciones.some((c) => c.id === b.coleccionId && c.section_id === b.seccionId)) b.coleccionId = null;
    const nombre = h("input", { class: "entrada", type: "text", maxlength: "120", autocomplete: "off", autocapitalize: "sentences", placeholder: "Funko Pop Harry Potter #01", enterkeyhint: "done", value: b.titulo });
    nombre.addEventListener("input", () => { b.titulo = nombre.value; errores.replaceChildren(); persistir(); });
    nombre.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); nombre.blur(); } });
    const errores = h("div", { class: "errores" });

    async function elegirSeccion() {
      const r = await UI.elegir({
        titulo: "Elige la sección", opciones: cat.secciones.map((s) => ({ id: s.id, nombre: s.name })), seleccionado: b.seccionId,
        vacio: "Todavía no tienes secciones. Crea la primera.",
        crear: {
          etiqueta: "+ Crear nueva sección", titulo: "Nueva sección", ejemplo: "Funko Pop", ayuda: "Por ejemplo: Funko Pop, Mangas, Libros.",
          duplicado: "Ya tienes una sección con ese nombre.",
          alCrear: async (texto) => { const s = await D.crearSeccion(App.tienda.id, texto); App.invalidarCategorias(); return { id: s.id, nombre: s.name }; },
        },
      });
      if (r === undefined || r.id === null) return;
      if (r.id !== b.seccionId) { b.seccionId = r.id; b.coleccionId = null; }
      persistirYa();
      repintar(true);
    }

    async function elegirColeccion() {
      const r = await UI.elegir({
        titulo: "Elige la colección", opciones: cat.colecciones.filter((c) => c.section_id === b.seccionId).map((c) => ({ id: c.id, nombre: c.name })),
        seleccionado: b.coleccionId, ninguno: "Sin colección", vacio: "Esta sección todavía no tiene colecciones.",
        crear: {
          etiqueta: "+ Crear nueva colección", titulo: "Nueva colección", ejemplo: "Harry Potter", ayuda: "Por ejemplo: Harry Potter, Dragon Ball, Marvel.",
          duplicado: "Ya tienes una colección con ese nombre en esta sección.",
          alCrear: async (texto) => { const c = await D.crearColeccion(App.tienda.id, b.seccionId, texto); App.invalidarCategorias(); return { id: c.id, nombre: c.name }; },
        },
      });
      if (r === undefined) return;
      b.coleccionId = r.id;
      persistirYa();
      repintar(true);
    }

    zona.append(
      h("h1", { text: TITULOS[2] }), errores,
      UI.campo("Nombre del producto", nombre, "Escribe el nombre como lo buscaría un cliente."),
      selector("Sección", nombreDe(cat.secciones, b.seccionId), "Toca para elegir la sección", elegirSeccion, false),
      selector("Colección (opcional)", b.coleccionId ? nombreDe(cat.colecciones, b.coleccionId) : "", b.seccionId ? "Toca para elegir la colección" : "Primero elige la sección", elegirColeccion, !b.seccionId,
        b.seccionId ? null : "La colección es un grupo dentro de la sección, por ejemplo «Harry Potter»."));
    return {
      siguiente: () => {
        const faltan = [];
        if (b.titulo.trim().length < 3) faltan.push(["Escribe el nombre del producto (al menos 3 letras).", nombre]);
        if (!b.seccionId) faltan.push(["Elige la sección del producto.", zona.querySelector(".selector")]);
        mostrarFaltas(errores, faltan);
        if (faltan.length) return;
        b.titulo = b.titulo.trim();
        ir(3);
      },
      atras: { texto: "Atrás", icono: "atras", accion: () => volver(1) },
    };
  }

  // ---------------------------------------------------------------- paso 3: precio y cantidad
  function paso3(zona) {
    const b = borrador;
    const precio = h("input", { id: "campo-precio", class: "entrada entrada--precio", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "0.00", enterkeyhint: "done", value: b.precio });
    const vista = h("p", { class: "ayuda", "aria-live": "polite" });
    function pintarVista() {
      const bueno = U.parsePrecio(precio.value);
      vista.textContent = bueno ? `Se verá como ${U.formatoSoles(bueno)}` : (precio.value.trim() ? "Escribe solo números. Ejemplo: 25 o 25.50" : "Escribe cuánto cuesta, en soles.");
    }
    precio.addEventListener("input", () => { b.precio = precio.value; errores.replaceChildren(); pintarVista(); persistir(); });
    precio.addEventListener("blur", () => { const bueno = U.parsePrecio(precio.value); if (bueno) { precio.value = bueno; b.precio = bueno; pintarVista(); persistir(); } });
    precio.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); precio.blur(); } });
    pintarVista();
    const cantidad = UI.contador({ valor: b.cantidad, min: 0, max: U.CANTIDAD_MAXIMA, etiqueta: "Cantidad", alCambiar: (n) => { b.cantidad = n; pintarCero(); persistir(); } });
    const aviso0 = h("p", { class: "ayuda", "aria-live": "polite" });
    const pintarCero = () => { aviso0.textContent = b.cantidad === 0 ? "Con 0 unidades, el producto se verá como «Agotado»." : ""; };
    pintarCero();
    const mostrar = UI.interruptor("Mostrar cuántas unidades quedan en la web", "Si lo dejas apagado, la web solo dice «Disponible» o «Agotado».", b.mostrarCant, (v) => { b.mostrarCant = v; persistir(); });
    const errores = h("div", { class: "errores" });
    zona.append(
      h("h1", { text: TITULOS[3] }), errores,
      h("div", { class: "campo" },
        h("label", { class: "campo__etiqueta", for: precio.id, text: "Precio en soles (S/)" }),
        h("div", { class: "precio" }, h("span", { class: "precio__s", "aria-hidden": "true", text: "S/" }), precio)), vista,
      h("div", { class: "campo" }, h("span", { class: "campo__etiqueta", id: "et-cantidad", text: "¿Cuántas unidades tienes?" }), cantidad.el, aviso0),
      mostrar.el);
    return {
      siguiente: () => {
        const bueno = U.parsePrecio(precio.value);
        if (!bueno) { mostrarFaltas(errores, [["Escribe un precio válido, solo números. Ejemplo: 25 o 25.50.", precio]]); return; }
        errores.replaceChildren();
        b.precio = bueno;
        ir(4);
      },
      atras: { texto: "Atrás", icono: "atras", accion: () => volver(2) },
    };
  }

  // ---------------------------------------------------------------- paso 4: descripcion, resumen y guardar
  async function paso4(zona) {
    const b = borrador;
    const cat = await App.cargarCategorias();
    if (b.seccionId && !cat.secciones.some((s) => s.id === b.seccionId)) { b.seccionId = null; b.coleccionId = null; }
    if (b.coleccionId && !cat.colecciones.some((c) => c.id === b.coleccionId && c.section_id === b.seccionId)) b.coleccionId = null;
    const descripcion = h("textarea", { class: "entrada entrada--area", rows: "5", maxlength: "2000", placeholder: "Ejemplo: Funko Pop nuevo, en su caja original con protector. Número 01.", "aria-label": "Descripción (opcional)" });
    descripcion.value = b.descripcion;
    descripcion.addEventListener("input", () => { b.descripcion = descripcion.value; persistir(); });

    function fila(etiqueta, valor, paso) {
      return h("div", { class: "resumen__fila" },
        h("div", {}, h("dt", { text: etiqueta }), h("dd", { text: valor })),
        h("button", { class: "btn btn--texto", type: "button", onclick: () => ir(paso), "aria-label": `Cambiar: ${etiqueta}` }, "Cambiar"));
    }
    const categoria = [nombreDe(cat.secciones, b.seccionId), b.coleccionId ? nombreDe(cat.colecciones, b.coleccionId) : ""].filter(Boolean).join(" › ");
    const miniaturas = h("div", { class: "resumen__fotos" }, b.fotos.map((f, i) => h("img", { src: f.vista, alt: `Foto ${i + 1}` })));
    const resumen = h("dl", { class: "resumen" },
      h("div", { class: "resumen__fila" }, h("div", {}, h("dt", { text: "Fotos" }), h("dd", { text: b.fotos.length ? `${b.fotos.length} ${U.plural(b.fotos.length, "foto", "fotos")}` : "Ninguna todavía" }), b.fotos.length ? miniaturas : null),
        h("button", { class: "btn btn--texto", type: "button", onclick: () => ir(1), "aria-label": "Cambiar: Fotos" }, "Cambiar")),
      fila("Nombre", b.titulo, 2), fila("Sección", categoria || "Sin sección", 2),
      fila("Precio", U.formatoSoles(b.precio), 3),
      fila("Cantidad", b.cantidad === 0 ? "0 (Agotado)" : `${b.cantidad} ${U.plural(b.cantidad, "unidad", "unidades")}${b.mostrarCant ? " · se muestra en la web" : " · no se muestra en la web"}`, 3));
    zona.append(
      h("h1", { text: TITULOS[4] }),
      UI.campo("Descripción (opcional)", descripcion, "Puedes tocar el micrófono de tu teclado y dictarla."),
      h("h2", { class: "seccion", text: "Revisa que esté bien" }), resumen,
      h("p", { class: "ayuda", text: "Al guardar, el producto queda como borrador: solo lo ves tú. Luego lo mandas a validar para que BoomArt lo publique." }));
    return {
      siguiente: () => {
        if (!b.seccionId) { avisar("Falta elegir la sección. Toca «Cambiar» en «Sección».", "warn"); return; }
        return guardarTodo();
      },
      textoSiguiente: "Guardar", iconoSiguiente: "visto",
      atras: { texto: "Atrás", icono: "atras", accion: () => volver(3) },
    };
  }

  // ---------------------------------------------------------------- guardar (reintentable)
  async function ejecutarGuardado(avance) {
    const b = borrador;
    const campos = {
      section_id: b.seccionId, collection_id: b.coleccionId, title: b.titulo.trim(), description: b.descripcion.trim(),
      price: Number(U.parsePrecio(b.precio)), qty: b.cantidad, show_qty: b.mostrarCant,
    };
    if (!b.guardado.producto) {
      avance("Guardando los datos del producto…");
      if (await D.productoExiste(b.productoId)) await D.actualizarProducto(b.productoId, campos);
      else {
        try { await D.crearProducto({ id: b.productoId, seller_id: App.tienda.id, ...campos }); }
        catch (e) { if (e.code === "23505") await D.actualizarProducto(b.productoId, campos); else throw e; }
      }
      b.guardado.producto = true;
      persistirYa();
    } else {
      avance("Guardando los datos del producto…");
      await D.actualizarProducto(b.productoId, campos);
    }
    await F.sincronizar({
      vendedorId: App.tienda.id, productoId: b.productoId, items: b.fotos, quitados: b.quitados,
      alAvanzar: avance, alGuardarEstado: persistirYa,
    });
  }

  async function guardarTodo() {
    const b = borrador;
    persistirYa();
    const r = await UI.conProgreso({
      titulo: "Guardando tu producto…", textoInicial: "Preparando…",
      trabajo: (avance) => ejecutarGuardado(avance), contexto: { duplicado: "Ya existe uno con ese nombre." },
    });
    if (r.sesion) { App.sesionVencida(); return; }
    if (!r.ok) return;
    ultimo = {
      id: b.productoId, titulo: b.titulo, seccionId: b.seccionId, coleccionId: b.coleccionId, precio: b.precio, cantidad: b.cantidad,
      mostrarCant: b.mostrarCant, descripcion: b.descripcion, fotos: b.fotos.length, codigo: "", enviado: false,
    };
    try { const fila = await D.obtenerProducto(b.productoId); if (fila) ultimo.codigo = fila.code; } catch { /* el codigo es solo informativo */ }
    F.liberar(b.fotos);
    await B.borrar(App.tienda.id);
    borrador = null;
    App.ir("#/publicar/listo", { reemplazar: true });
  }

  // ---------------------------------------------------------------- pantalla de exito
  function montarListo(raiz) {
    if (!ultimo) { App.ir("#/productos", { reemplazar: true }); return; }
    const u = ultimo;
    const puedeEnviar = u.fotos > 0;
    const mensaje = h("p", { class: "exito__texto", "aria-live": "polite" });
    const pintarMensaje = () => {
      mensaje.textContent = u.enviado ? "Listo. Avísale a Adrián que ya lo mandaste."
        : (puedeEnviar ? "Por ahora solo lo ves tú. Mándalo a validar para que BoomArt lo publique en la web."
          : "Para mandarlo a BoomArt le falta una foto. Agrégala desde «Mis productos».");
    };
    pintarMensaje();
    const enviar = h("button", { class: "btn btn--primario btn--bloque btn--alto", type: "button", disabled: !puedeEnviar || null }, icono("enviar", 24), "Mandar a validar");
    enviar.addEventListener("click", async () => {
      try {
        await UI.trabajando(enviar, "Mandando…", () => D.actualizarProducto(u.id, { review_state: "en_validacion" }));
        u.enviado = true;
        enviar.disabled = true;
        enviar.replaceChildren(icono("visto", 24), "Mandado");
        pintarMensaje();
        avisar("Producto mandado a validar. ✔");
      } catch (err) { App.manejarError(err); }
    });
    const copiar = async (conDatos) => {
      await descartarBorrador(conDatos ? { seccionId: u.seccionId, coleccionId: u.coleccionId, precio: u.precio, cantidad: u.cantidad, mostrarCant: u.mostrarCant, descripcion: u.descripcion } : null);
      App.ir("#/publicar/1", { reemplazar: true });
    };
    raiz.append(h("div", { class: "exito" },
      h("span", { class: "exito__marca" }, icono("visto", 44)),
      h("h1", { text: "¡Listo, quedó guardado!" }),
      h("p", { class: "exito__nombre", text: u.titulo }),
      u.codigo ? h("p", { class: "ayuda ayuda--centro", text: `Código del producto: ${u.codigo}` }) : null,
      mensaje),
    h("div", { class: "apilados" },
      enviar,
      h("button", { class: "btn btn--claro btn--bloque btn--alto", type: "button", onclick: () => copiar(true) }, icono("publicar", 24), "Publicar otro igual"),
      h("button", { class: "btn btn--claro btn--bloque btn--alto", type: "button", onclick: () => copiar(false) }, icono("camara", 24), "Publicar otro"),
      h("a", { class: "btn btn--claro btn--bloque btn--alto", href: "#/inicio" }, icono("inicio", 24), "Volver al inicio")),
    h("p", { class: "ayuda ayuda--centro", text: "«Publicar otro igual» copia la sección, la colección, el precio y la descripción; tú pones las fotos nuevas." }));
  }

  // ---------------------------------------------------------------- pantalla
  App.pantallas.publicar = {
    olvidar() { borrador = null; ultimo = null; ultimoAvance = null; },
    async montar(raiz, params, vive) {
      await asegurarBorrador();
      if (!vive()) return;
      if (params.paso === "listo") { montarListo(raiz); return; }
      if (!params.paso) { history.replaceState(null, "", `#/publicar/${borrador.paso}`); params.paso = String(borrador.paso); }
      const paso = Number(params.paso);
      borrador.paso = paso;
      document.body.classList.add("con-barra-pasos");
      const alOcultar = () => { if (document.visibilityState === "hidden") persistirYa(); };
      document.addEventListener("visibilitychange", alOcultar);
      window.addEventListener("pagehide", persistirYa);

      const zona = h("div", { class: "paso" });
      let barraActual = h("div");
      raiz.append(encabezadoPasos(paso), zona, barraActual);

      async function pintar(conservarPosicion) {
        const antes = window.scrollY;
        zona.replaceChildren();
        let control;
        if (paso === 1) control = paso1(zona);
        else if (paso === 2) control = await paso2(zona, pintar);
        else if (paso === 3) control = paso3(zona);
        else control = await paso4(zona);
        if (!vive()) return;
        const siguiente = h("button", { class: "btn btn--primario", type: "button" }, icono(control.iconoSiguiente || "derecha", 24), control.textoSiguiente || "Siguiente");
        siguiente.addEventListener("click", async () => {
          if (siguiente.getAttribute("aria-busy") === "true") return;
          siguiente.setAttribute("aria-busy", "true");
          try { await control.siguiente(); } finally { siguiente.removeAttribute("aria-busy"); }
        });
        const atras = control.atras;
        const nueva = barraDeAcciones(h("button", { class: "btn btn--claro", type: "button", onclick: atras.accion }, icono(atras.icono, 24), atras.texto), siguiente);
        barraActual.replaceWith(nueva);
        barraActual = nueva;
        if (conservarPosicion) window.scrollTo(0, antes);
      }
      await pintar(false);

      return {
        limpiar() {
          persistirYa();
          document.body.classList.remove("con-barra-pasos");
          document.removeEventListener("visibilitychange", alOcultar);
          window.removeEventListener("pagehide", persistirYa);
          persistir.cancelar();
        },
      };
    },
  };
})(window);
