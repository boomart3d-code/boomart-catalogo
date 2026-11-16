/*
 * Pantallas: Mis productos (lista con filtros), Editar producto y Mandar a validar.
 */
(function (root) {
  "use strict";
  const App = root.VitrinaApp;
  const U = root.VitrinaUtil;
  const D = root.VitrinaDatos;
  const UI = root.VitrinaUI;
  const F = root.VitrinaFotos;
  const { h, icono, avisar } = UI;

  function etiquetas(p) {
    return h("div", { class: "etiquetas" }, U.etiquetasProducto(p).map((e) => h("span", { class: `etiqueta etiqueta--${e.tono}`, text: e.texto })));
  }

  const textoCantidad = (p) => (p.qty > 0 ? `${p.qty} ${U.plural(p.qty, "unidad", "unidades")}` : "Agotado");

  function tarjetaProducto(p) {
    const portada = U.fotoPortada(p.product_photos);
    return h("a", { class: "tarjeta", href: `#/producto/${p.id}` },
      UI.miniatura(portada && portada.thumb_path, "miniatura--tarjeta"),
      h("div", { class: "tarjeta__cuerpo" },
        h("strong", { class: "tarjeta__titulo", text: p.title || "Sin nombre" }),
        h("span", { class: "tarjeta__linea", text: `${p.price === null ? "Sin precio" : U.formatoSoles(p.price)} · ${textoCantidad(p)}` }),
        etiquetas(p),
        p.review_state === "cambios_pedidos" && p.review_note ? h("span", { class: "tarjeta__nota", text: `BoomArt dice: «${p.review_note}»` }) : null),
      h("span", { class: "tarjeta__flecha" }, icono("derecha", 24)));
  }

  // ---------------------------------------------------------------- Mis productos
  const memoria = { filtro: "todos", texto: "" };     // se recuerda al volver desde «Editar»

  App.pantallas.productos = {
    olvidar() { memoria.filtro = "todos"; memoria.texto = ""; },
    async montar(raiz, params) {
      if (params.f && U.FILTROS.some((f) => f.clave === params.f)) { memoria.filtro = params.f; memoria.texto = ""; }
      let filas = [];
      let hayMas = false;
      let peticion = 0;
      let conteos = null;

      const buscador = h("input", { class: "entrada entrada--buscar", type: "search", placeholder: "Buscar por nombre…", "aria-label": "Buscar un producto por nombre", autocomplete: "off", enterkeyhint: "search", value: memoria.texto });
      const chips = h("div", { class: "chips", role: "group", "aria-label": "Filtrar por estado" });
      const lista = h("div", { class: "lista-tarjetas" });
      const pie = h("div", { class: "pie-lista" });

      function pintarChips() {
        chips.replaceChildren(...U.FILTROS.map((f) => {
          const n = conteos ? conteos[f.clave === "ocultos" ? "ocultos" : f.clave === "todos" ? "todos" : f.clave] : null;
          return h("button", {
            class: `chip${memoria.filtro === f.clave ? " es-activo" : ""}`, type: "button", "aria-pressed": memoria.filtro === f.clave ? "true" : "false",
            onclick: () => { memoria.filtro = f.clave; pintarChips(); cargar(true); },
          }, f.texto, n === null || n === undefined ? null : h("span", { class: "chip__n", text: String(n) }));
        }));
      }

      async function cargar(reiniciar) {
        const mia = ++peticion;
        if (reiniciar) { filas = []; hayMas = false; lista.replaceChildren(UI.cargando("Buscando…")); pie.replaceChildren(); }
        else pie.replaceChildren(UI.cargando("Cargando más…"));
        try {
          const r = await D.listarProductos({ filtro: memoria.filtro, texto: memoria.texto, desde: filas.length, cantidad: 25 });
          if (mia !== peticion) return;
          const desde = filas.length;
          filas = filas.concat(r.filas);
          hayMas = r.hayMas;
          if (reiniciar) lista.replaceChildren();
          lista.append(...r.filas.map(tarjetaProducto));
          if (!filas.length) lista.replaceChildren(vacioLista());
          pie.replaceChildren(...(hayMas ? [h("button", { class: "btn btn--claro btn--bloque", type: "button", onclick: () => cargar(false) }, "Ver más productos")] : []));
          if (r.filas.length) UI.cargarMiniaturas(lista);
          void desde;
        } catch (err) {
          if (mia !== peticion) return;
          if (App.esErrorDeSesion(err)) { App.sesionVencida(); return; }
          pie.replaceChildren();
          lista.replaceChildren(UI.panelError(U.mensajeAmable(err), () => cargar(true)));
        }
      }

      function vacioLista() {
        const buscando = memoria.texto.trim() !== "";
        if (memoria.filtro === "todos" && !buscando) {
          return UI.vacio("Todavía no tienes productos", "Publica el primero: solo necesitas una foto, el nombre y el precio.",
            h("a", { class: "btn btn--primario btn--bloque", href: "#/publicar" }, icono("publicar", 22), "Publicar un producto"));
        }
        return UI.vacio("No hay productos aquí", buscando ? "Prueba con otra palabra o cambia el filtro." : "No tienes productos con este estado.",
          h("button", { class: "btn btn--claro btn--bloque", type: "button", onclick: () => { memoria.filtro = "todos"; memoria.texto = ""; buscador.value = ""; pintarChips(); cargar(true); } }, "Ver todos"));
      }

      const buscar = UI.retrasar(() => { memoria.texto = buscador.value; cargar(true); }, 350);
      buscador.addEventListener("input", buscar);
      buscador.addEventListener("search", () => { buscar.cancelar(); memoria.texto = buscador.value; cargar(true); });

      raiz.append(h("h1", { text: "Mis productos" }),
        h("div", { class: "buscar" }, icono("buscar", 24), buscador), chips, lista, pie);
      pintarChips();
      D.contarEstados().then((c) => { conteos = c; pintarChips(); }).catch(() => { /* los numeros son un extra: la lista funciona sin ellos */ });
      await cargar(true);
      return { limpiar() { buscar.cancelar(); peticion += 1; } };
    },
  };

  // ---------------------------------------------------------------- Editar producto
  App.pantallas.editar = {
    async montar(raiz, params, vive) {
      App.barra({ atras: "#/productos" });
      const [p, cat] = await Promise.all([D.obtenerProducto(params.id), App.cargarCategorias(true)]);
      if (!vive()) return;
      if (!p) {
        raiz.append(UI.vacio("No encontramos este producto", "Puede que ya lo hayas borrado.", h("a", { class: "btn btn--claro btn--bloque", href: "#/productos" }, "Ir a mis productos")));
        return;
      }
      const urls = await D.urlsFirmadas(p.product_photos.map((f) => f.thumb_path));
      if (!vive()) return;

      const fotos = p.product_photos.map((f) => F.deFilaRemota(f, urls[f.thumb_path]));
      const quitados = [];
      const form = {
        titulo: p.title, descripcion: p.description, seccionId: p.section_id, coleccionId: p.collection_id,
        precio: p.price === null ? "" : U.parsePrecio(String(p.price)) || String(p.price), cantidad: p.qty, mostrarCant: p.show_qty, visible: p.visible,
      };
      let original = { ...form };
      let estadoRevision = p.review_state;
      let publicado = !!p.published_at;

      const sucio = () => JSON.stringify(form) !== JSON.stringify(original) || F.hayCambios(fotos, quitados);
      App.guardia = sucio;
      document.body.classList.add("con-barra-pasos");

      // ---- cabecera y avisos
      const estado = h("div", { class: "estado" }, etiquetas({ ...p, review_state: estadoRevision }), h("span", { class: "codigo", text: `Código: ${p.code}` }));
      const nota = p.review_note && estadoRevision !== "en_validacion" && estadoRevision !== "aprobado"
        ? h("section", { class: "alerta", "aria-label": "Mensaje de BoomArt" },
          h("h2", { class: "alerta__titulo" }, icono("aviso", 26), "BoomArt te pide cambios"),
          h("p", { class: "alerta__nota", text: `«${p.review_note}»` }),
          h("p", { class: "ayuda", text: "Haz los cambios, toca «Guardar cambios» y luego manda el producto a validar." })) : null;
      const avisoPublicado = publicado
        ? h("div", { class: "nota" }, icono("tienda", 22), h("p", {}, "Este producto ya está en la web. El ", h("strong", { text: "precio y la cantidad" }), " cambian al instante. El nombre, la descripción, la sección y las fotos se verán en la web cuando BoomArt los revise.")) : null;
      const avisoAdmin = p.admin_hidden ? h("div", { class: "nota nota--oscura" }, icono("candado", 22), h("p", { text: "BoomArt ocultó este producto. Consulta con Adrián para saber por qué." })) : null;

      // ---- campos
      const titulo = h("input", { class: "entrada", type: "text", maxlength: "120", autocomplete: "off", autocapitalize: "sentences", value: form.titulo, enterkeyhint: "done" });
      titulo.addEventListener("input", () => { form.titulo = titulo.value; refrescar(); });
      titulo.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); titulo.blur(); } });
      const precio = h("input", { id: "campo-precio-e", class: "entrada entrada--precio", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "0.00", value: form.precio, enterkeyhint: "done" });
      precio.addEventListener("input", () => { form.precio = precio.value; refrescar(); });
      precio.addEventListener("blur", () => { const bueno = U.parsePrecio(precio.value); if (bueno) { precio.value = bueno; form.precio = bueno; refrescar(); } });
      precio.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); precio.blur(); } });
      const descripcion = h("textarea", { class: "entrada entrada--area", rows: "5", maxlength: "2000", placeholder: "Cuenta algo del producto: estado, número, detalles." });
      descripcion.value = form.descripcion;
      descripcion.addEventListener("input", () => { form.descripcion = descripcion.value; refrescar(); });
      const cantidad = UI.contador({ valor: form.cantidad, min: 0, max: U.CANTIDAD_MAXIMA, etiqueta: "Cantidad", alCambiar: (n) => { form.cantidad = n; aviso0(); refrescar(); } });
      const cero = h("p", { class: "ayuda", "aria-live": "polite" });
      const aviso0 = () => { cero.textContent = form.cantidad === 0 ? "Con 0 unidades, el producto se ve como «Agotado»." : ""; };
      aviso0();
      const mostrarCant = UI.interruptor("Mostrar cuántas unidades quedan en la web", "Apagado: la web solo dice «Disponible» o «Agotado».", form.mostrarCant, (v) => { form.mostrarCant = v; refrescar(); });
      const visible = UI.interruptor("Mostrar en la tienda", "Si lo apagas, el producto desaparece de la web al instante. Puedes volver a mostrarlo cuando quieras.", form.visible, (v) => { form.visible = v; refrescar(); });

      const grilla = F.cuadricula({ items: fotos, quitados, alCambiar: () => refrescar() });

      const zonaCategoria = h("div", { class: "campos-categoria" });
      function pintarCategoria() {
        const nombreSeccion = (cat.secciones.find((s) => s.id === form.seccionId) || {}).name || "";
        const nombreColeccion = (cat.colecciones.find((c) => c.id === form.coleccionId) || {}).name || "";
        const sel = (etiqueta, texto, vacio, alTocar, deshab, ayuda) => UI.campo(etiqueta,
          h("button", { class: "selector", type: "button", disabled: deshab || null, "aria-haspopup": "dialog", onclick: alTocar },
            h("span", { class: texto ? "selector__valor" : "selector__vacio", text: texto || vacio }), icono("abajo", 26)), ayuda);
        zonaCategoria.replaceChildren(
          sel("Sección", nombreSeccion, "Toca para elegir la sección", elegirSeccion, false),
          sel("Colección (opcional)", nombreColeccion, form.seccionId ? "Toca para elegir la colección" : "Primero elige la sección", elegirColeccion, !form.seccionId));
      }
      async function elegirSeccion() {
        const r = await UI.elegir({
          titulo: "Elige la sección", opciones: cat.secciones.map((s) => ({ id: s.id, nombre: s.name })), seleccionado: form.seccionId,
          vacio: "Todavía no tienes secciones. Crea la primera.",
          crear: { etiqueta: "+ Crear nueva sección", titulo: "Nueva sección", ejemplo: "Funko Pop", ayuda: "Por ejemplo: Funko Pop, Mangas, Libros.", duplicado: "Ya tienes una sección con ese nombre.",
            alCrear: async (t) => { const s = await D.crearSeccion(App.tienda.id, t); App.invalidarCategorias(); return { id: s.id, nombre: s.name }; } },
        });
        if (r === undefined || r.id === null) return;
        if (r.nueva) { const nuevas = await App.cargarCategorias(true); cat.secciones = nuevas.secciones; cat.colecciones = nuevas.colecciones; }
        if (r.id !== form.seccionId) { form.seccionId = r.id; form.coleccionId = null; }
        pintarCategoria(); refrescar();
      }
      async function elegirColeccion() {
        const r = await UI.elegir({
          titulo: "Elige la colección", opciones: cat.colecciones.filter((c) => c.section_id === form.seccionId).map((c) => ({ id: c.id, nombre: c.name })), seleccionado: form.coleccionId,
          ninguno: "Sin colección", vacio: "Esta sección todavía no tiene colecciones.",
          crear: { etiqueta: "+ Crear nueva colección", titulo: "Nueva colección", ejemplo: "Harry Potter", ayuda: "Por ejemplo: Harry Potter, Dragon Ball, Marvel.", duplicado: "Ya tienes una colección con ese nombre en esta sección.",
            alCrear: async (t) => { const c = await D.crearColeccion(App.tienda.id, form.seccionId, t); App.invalidarCategorias(); return { id: c.id, nombre: c.name }; } },
        });
        if (r === undefined) return;
        if (r.nueva) { const nuevas = await App.cargarCategorias(true); cat.secciones = nuevas.secciones; cat.colecciones = nuevas.colecciones; }
        form.coleccionId = r.id;
        pintarCategoria(); refrescar();
      }
      pintarCategoria();

      // ---- guardar
      const errores = h("div", { class: "errores" });
      const guardarBoton = h("button", { class: "btn btn--primario btn--bloque", type: "button" }, icono("visto", 24), "Guardar cambios");
      const estadoGuardar = h("p", { class: "barra-guardar__texto", "aria-live": "polite" });
      function refrescar() {
        const hay = sucio();
        guardarBoton.disabled = !hay;
        estadoGuardar.textContent = hay ? "Tienes cambios sin guardar." : "No hay cambios por guardar.";
        estadoGuardar.classList.toggle("es-alerta", hay);
      }

      function listaDeCambios() {
        const cambios = {};
        if (form.titulo.trim() !== original.titulo.trim()) cambios.title = form.titulo.trim();
        if (form.descripcion.trim() !== original.descripcion.trim()) cambios.description = form.descripcion.trim();
        if (form.seccionId !== original.seccionId) cambios.section_id = form.seccionId;
        if (form.coleccionId !== original.coleccionId || form.seccionId !== original.seccionId) cambios.collection_id = form.coleccionId;
        if (form.precio !== original.precio) cambios.price = Number(U.parsePrecio(form.precio));
        if (form.cantidad !== original.cantidad) cambios.qty = form.cantidad;
        if (form.mostrarCant !== original.mostrarCant) cambios.show_qty = form.mostrarCant;
        if (form.visible !== original.visible) cambios.visible = form.visible;
        return cambios;
      }

      async function guardar() {
        errores.replaceChildren();
        const faltan = [];
        if (form.titulo.trim().length < 3) faltan.push(["Escribe el nombre del producto (al menos 3 letras).", titulo]);
        if (!U.parsePrecio(form.precio)) faltan.push(["Escribe un precio válido, solo números. Ejemplo: 25 o 25.50.", precio]);
        if (!form.seccionId) faltan.push(["Elige la sección del producto.", zonaCategoria.querySelector(".selector")]);
        if (faltan.length) {
          errores.replaceChildren(...faltan.map(([t]) => h("p", { class: "error", role: "alert", text: t })));
          errores.scrollIntoView({ block: "center", behavior: "smooth" });
          faltan[0][1].focus({ preventScroll: true });
          return;
        }
        form.precio = U.parsePrecio(form.precio);
        precio.value = form.precio;
        const fotosCambiaron = F.hayCambios(fotos, quitados);
        const cambios = listaDeCambios();
        const pideRevision = U.cambioPideRevision(
          { title: original.titulo, description: original.descripcion, section_id: original.seccionId, collection_id: original.coleccionId },
          { title: form.titulo, description: form.descripcion, section_id: form.seccionId, collection_id: form.coleccionId }, fotosCambiaron);
        if (pideRevision && publicado) {
          const sigue = await UI.confirmar({
            titulo: "Este cambio se verá en la web cuando BoomArt lo revise.",
            texto: "Tu producto sigue publicado como estaba. Cuando termines, manda el producto a validar y BoomArt aprobará el cambio. El precio y la cantidad sí cambian al instante.",
            si: "Guardar los cambios", no: "Todavía no",
          });
          if (!sigue) return;
        } else if (pideRevision && (estadoRevision === "en_validacion" || estadoRevision === "cambios_pedidos")) {
          const sigue = await UI.confirmar({
            titulo: "El producto vuelve a «Sin enviar»",
            texto: "Como cambiaste el nombre, la descripción, la sección o las fotos, tendrás que mandarlo a validar otra vez.",
            si: "Guardar los cambios", no: "Todavía no",
          });
          if (!sigue) return;
        }
        const r = await UI.conProgreso({
          titulo: "Guardando los cambios…", textoInicial: "Guardando…", contexto: { duplicado: "Ya existe uno con ese nombre." },
          trabajo: async (avance) => {
            const pendientes = listaDeCambios();
            if (Object.keys(pendientes).length) {
              avance("Guardando los datos…");
              const fila = await D.actualizarProducto(p.id, pendientes);
              estadoRevision = fila.review_state;
              original = { ...form };
            }
            if (F.hayCambios(fotos, quitados)) {
              await F.sincronizar({ vendedorId: App.tienda.id, productoId: p.id, items: fotos, quitados, alAvanzar: avance });
              if (estadoRevision !== "borrador") { avance("Marcando el producto como «Sin enviar»…"); const fila = await D.actualizarProducto(p.id, { review_state: "borrador" }); estadoRevision = fila.review_state; }
            }
          },
        });
        void cambios;
        if (r.sesion) { App.sesionVencida(); return; }
        if (!r.ok) { refrescar(); return; }
        App.guardia = null;
        avisar("Cambios guardados. ✔");
        App.recargarPantalla();
      }
      guardarBoton.addEventListener("click", guardar);

      // ---- mandar a validar este producto
      const listo = U.listoParaEnviar({ title: form.titulo, price: p.price, section_id: p.section_id }, p.product_photos.length);
      const puedeMandar = (p.review_state === "borrador" || p.review_state === "cambios_pedidos") && listo.ok && !p.admin_hidden;
      const mandar = puedeMandar ? h("section", { class: "bloque bloque--destacado" },
        h("h2", { text: "¿Ya está listo?" }),
        h("p", { text: "Mándalo a validar para que BoomArt lo revise y lo publique en la web." }),
        (() => {
          const boton = h("button", { class: "btn btn--primario btn--bloque", type: "button" }, icono("enviar", 24), "Mandar a validar este producto");
          boton.addEventListener("click", async () => {
            if (sucio()) { avisar("Primero toca «Guardar cambios» y luego lo mandas.", "warn"); return; }
            try {
              await UI.trabajando(boton, "Mandando…", () => D.actualizarProducto(p.id, { review_state: "en_validacion" }));
              avisar("Listo. Avísale a Adrián que ya lo mandaste. ✔");
              App.guardia = null;
              App.recargarPantalla();
            } catch (err) { App.manejarError(err); }
          });
          return boton;
        })()) : null;

      // ---- borrar
      async function borrar() {
        const seguro = await UI.confirmar({
          titulo: "¿Borrar este producto?",
          texto: `Se borrará «${p.title || "este producto"}» con todas sus fotos y desaparecerá de la web.`,
          detalle: "No se puede deshacer.", si: "Sí, borrar para siempre", no: "No, no lo borres", peligro: true,
        });
        if (!seguro) return;
        const r = await UI.conProgreso({
          titulo: "Borrando el producto…", textoInicial: "Borrando fotos…", contexto: {},
          trabajo: async (avance) => {
            const todas = [...fotos, ...quitados];
            const rutas = [];
            for (const f of todas) { const d = f.remoto && f.path ? { path: f.path, thumb_path: f.thumb_path } : U.rutasFoto(App.tienda.id, p.id, f.id, f.ext); rutas.push(d.path, d.thumb_path); }
            await D.quitarArchivos(rutas);
            avance("Borrando el producto…");
            await D.borrarProducto(p.id);
          },
        });
        if (r.sesion) { App.sesionVencida(); return; }
        if (!r.ok) return;
        App.guardia = null;
        avisar("Producto borrado.");
        App.ir("#/productos", { reemplazar: true });
      }

      const bloque = (titulo, ...contenido) => h("section", { class: "bloque" }, h("h2", { text: titulo }), ...contenido);
      raiz.append(
        h("h1", { text: p.title || "Editar producto" }), estado, errores, ...[nota, avisoPublicado, avisoAdmin, mandar].filter(Boolean),
        bloque("Fotos", grilla.el),
        bloque("Qué es", UI.campo("Nombre del producto", titulo), zonaCategoria),
        bloque("Precio y cantidad",
          h("div", { class: "campo" }, h("label", { class: "campo__etiqueta", for: precio.id, text: "Precio en soles (S/)" }),
            h("div", { class: "precio" }, h("span", { class: "precio__s", "aria-hidden": "true", text: "S/" }), precio)),
          h("div", { class: "campo" }, h("span", { class: "campo__etiqueta", text: "¿Cuántas unidades tienes?" }), cantidad.el, cero),
          mostrarCant.el),
        bloque("En la tienda", visible.el),
        bloque("Descripción", UI.campo("Descripción (opcional)", descripcion, "Puedes tocar el micrófono de tu teclado y dictarla.")),
        h("section", { class: "bloque bloque--peligro" },
          h("h2", { text: "Borrar" }), h("p", { text: "Si ya no vendes este producto, puedes borrarlo. Se borra con todas sus fotos." }),
          h("button", { class: "btn btn--peligro-claro btn--bloque", type: "button", onclick: borrar }, icono("papelera", 24), "Borrar este producto")),
        h("div", { class: "barra-guardar" }, h("div", { class: "barra-guardar__interior" }, estadoGuardar, guardarBoton)));
      refrescar();
      return { limpiar() { document.body.classList.remove("con-barra-pasos"); F.liberar(fotos.concat(quitados)); } };
    },
  };

  // ---------------------------------------------------------------- Mandar a validar
  App.pantallas.validar = {
    async montar(raiz) {
      App.barra({ atras: "#/inicio" });
      const todos = await D.productosSinEnviar();
      const evaluados = todos.map((p) => ({ p, r: U.listoParaEnviar(p, (p.product_photos || []).length) }));
      const listos = evaluados.filter((e) => e.r.ok);
      const incompletos = evaluados.filter((e) => !e.r.ok);

      raiz.append(h("h1", { text: "Mandar a validar" }));
      if (!todos.length) {
        raiz.append(UI.vacio("No tienes nada por mandar", "Todo lo que guardaste ya fue enviado a BoomArt o está publicado.", h("a", { class: "btn btn--primario btn--bloque", href: "#/publicar" }, icono("publicar", 22), "Publicar un producto")));
        return;
      }
      document.body.classList.add("con-barra-pasos");
      raiz.append(h("p", { class: "subtitulo", text: "BoomArt revisa lo que mandes y lo publica en la web. Marca los productos que quieres mandar." }));

      const marcados = new Set(listos.map((e) => e.p.id));
      const boton = h("button", { class: "btn btn--primario btn--bloque", type: "button" }, icono("enviar", 24), "");
      const textoBoton = () => { boton.replaceChildren(icono("enviar", 24), `Mandar a validar (${marcados.size})`); boton.disabled = marcados.size === 0; };
      const cajas = [];

      function filaListo(e) {
        const portada = U.fotoPortada(e.p.product_photos);
        const caja = h("input", { type: "checkbox", class: "marca__caja" });
        caja.checked = true;
        caja.addEventListener("change", () => { if (caja.checked) marcados.add(e.p.id); else marcados.delete(e.p.id); textoBoton(); });
        cajas.push(caja);
        return h("label", { class: "fila-marca" }, caja,
          UI.miniatura(portada && portada.thumb_path, "miniatura--chica"),
          h("span", { class: "fila-marca__texto" }, h("strong", { text: e.p.title }), h("span", { text: `${U.formatoSoles(e.p.price)} · ${e.p.published_at ? "Publicado, con cambios" : "Sin enviar"}` })));
      }

      const todosCajas = h("div", { class: "fila-botones" },
        h("button", { class: "btn btn--claro btn--chico", type: "button", onclick: () => { cajas.forEach((c) => { c.checked = true; }); listos.forEach((e) => marcados.add(e.p.id)); textoBoton(); } }, "Marcar todos"),
        h("button", { class: "btn btn--claro btn--chico", type: "button", onclick: () => { cajas.forEach((c) => { c.checked = false; }); marcados.clear(); textoBoton(); } }, "Quitar todos"));

      if (listos.length) raiz.append(h("section", { class: "bloque" }, h("h2", { text: `Listos para mandar (${listos.length})` }), todosCajas, h("div", { class: "lista-marcas" }, listos.map(filaListo))));
      if (incompletos.length) {
        raiz.append(h("section", { class: "bloque" }, h("h2", { text: `Les falta algo (${incompletos.length})` }),
          h("p", { class: "ayuda", text: "Estos todavía no se pueden mandar. Toca «Completar» para arreglarlos." }),
          h("div", { class: "lista-tarjetas" }, incompletos.map((e) => {
            const portada = U.fotoPortada(e.p.product_photos);
            return h("div", { class: "tarjeta tarjeta--falta" },
              UI.miniatura(portada && portada.thumb_path, "miniatura--tarjeta"),
              h("div", { class: "tarjeta__cuerpo" }, h("strong", { class: "tarjeta__titulo", text: e.p.title || "Sin nombre" }),
                h("span", { class: "tarjeta__falta", text: `Falta: ${e.r.faltan.join(", ")}.` }),
                h("a", { class: "btn btn--claro btn--chico", href: `#/producto/${e.p.id}` }, icono("lapiz", 20), "Completar")));
          }))));
      }
      UI.cargarMiniaturas(raiz);

      async function mandar() {
        const ids = Array.from(marcados);
        if (!ids.length) return;
        const enviados = new Set();
        const fallos = [];
        const r = await UI.conProgreso({
          titulo: "Mandando a BoomArt…", textoInicial: "Preparando…", contexto: {},
          trabajo: async (avance) => {
            for (const id of ids) {
              if (enviados.has(id) || fallos.some((f) => f.id === id)) continue;
              avance(`Mandando ${enviados.size + fallos.length + 1} de ${ids.length}…`);
              const dato = evaluados.find((e) => e.p.id === id).p;
              try { await D.actualizarProducto(id, { review_state: "en_validacion" }); enviados.add(id); }
              catch (err) {
                if (App.esErrorDeSesion(err) || /^E_VALIDATION/.test(String(err.message)) === false) throw err;
                fallos.push({ id, titulo: dato.title, motivo: U.mensajeAmable(err) });
              }
            }
          },
        });
        if (r.sesion) { App.sesionVencida(); return; }
        if (!r.ok) { if (enviados.size) { avisar(`Se mandaron ${enviados.size}. Revisa la lista y reintenta con los demás.`, "warn"); App.recargarPantalla(); } return; }
        document.body.classList.remove("con-barra-pasos");
        raiz.replaceChildren(h("div", { class: "exito" },
          h("span", { class: "exito__marca" }, icono("visto", 44)),
          h("h1", { text: enviados.size ? "Listo, ya los mandaste" : "No se pudo mandar" }),
          enviados.size ? h("p", { class: "exito__texto", text: "Listo. Avísale a Adrián que ya los mandaste." }) : null,
          enviados.size ? h("p", { class: "ayuda ayuda--centro", text: `${enviados.size} ${U.plural(enviados.size, "producto mandado", "productos mandados")} a BoomArt.` }) : null,
          fallos.length ? h("div", { class: "nota" }, h("strong", { text: "No se pudieron mandar:" }), h("ul", {}, fallos.map((f) => h("li", { text: `${f.titulo || "Producto"}: ${f.motivo}` })))) : null),
        h("div", { class: "apilados" },
          h("a", { class: "btn btn--primario btn--bloque btn--alto", href: "#/inicio" }, icono("inicio", 24), "Volver al inicio"),
          h("a", { class: "btn btn--claro btn--bloque btn--alto", href: "#/productos?f=en_validacion" }, icono("productos", 24), "Ver lo que mandé")));
      }
      boton.addEventListener("click", mandar);
      textoBoton();
      raiz.append(h("div", { class: "barra-guardar" }, h("div", { class: "barra-guardar__interior" }, boton)));
      return { limpiar() { document.body.classList.remove("con-barra-pasos"); } };
    },
  };
})(window);
