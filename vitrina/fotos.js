/*
 * Fotos de un producto: (1) la cuadricula que ve Marcos (agregar, quitar, hacer principal) y (2) el motor que las sincroniza
 * con la base y con Storage. El mismo motor sirve para «Publicar un producto» (producto nuevo) y para «Editar producto».
 *
 * Una foto es { id, remoto, blob, thumb, mime, ext, bytes, vista, posicion, hecho: { archivo, mini, fila } }.
 *  - `hecho` recuerda que parte ya esta en el servidor: si se corta internet a la mitad, al reintentar solo se sube lo que falta
 *    (subir un archivo que ya existe y insertar una fila repetida se tratan como exito).
 *  - Orden correcto (contrato): primero existe el producto; luego se sube la foto y su miniatura; al final se inserta la fila.
 *  - Al quitar una foto: primero los 2 archivos de Storage y despues la fila.
 */
(function (root) {
  "use strict";
  const U = root.VitrinaUtil;
  const D = () => root.VitrinaDatos;
  const UI = () => root.VitrinaUI;

  const GUIAS = [
    "Foto 1: el frente de la caja",
    "Foto 2: la figura",
    "Foto 3 (opcional): un detalle",
    "Foto 4 (opcional): otra vista",
  ];

  function rutasDe(vendedorId, productoId, foto) {
    return foto.remoto && foto.path ? { path: foto.path, thumb_path: foto.thumb_path } : U.rutasFoto(vendedorId, productoId, foto.id, foto.ext);
  }

  /** Foto que ya esta en la base (viene de product_photos). `vista` es una direccion firmada para mostrarla. */
  function deFilaRemota(fila, vista) {
    return {
      id: fila.id, remoto: true, path: fila.path, thumb_path: fila.thumb_path, bytes: fila.bytes, ext: /\.webp$/.test(fila.path) ? "webp" : "jpg",
      posicion: fila.position, vista: vista || null, hecho: { archivo: true, mini: true, fila: true },
    };
  }

  /** Foto recien preparada en el celular (todavia nada en el servidor). */
  function deArchivoNuevo(resultado) {
    return {
      id: U.nuevoId(), remoto: false, blob: resultado.blob, thumb: resultado.thumb, mime: resultado.mime, ext: resultado.ext, bytes: resultado.bytes,
      vista: URL.createObjectURL(resultado.blob), posicion: null, hecho: { archivo: false, mini: false, fila: false },
    };
  }

  function liberar(fotos) {
    for (const f of fotos) if (f.vista && /^blob:/.test(f.vista)) URL.revokeObjectURL(f.vista);
  }

  /**
   * Deja el servidor igual que la lista `items` (en ese orden) y borra lo de `quitados`.
   * Si algo falla lanza el error y deja `hecho` al dia: llamar otra vez continua donde se quedo.
   * `alAvanzar(texto)` se llama antes de cada paso (para mostrar progreso) y `alGuardarEstado()` tras cada paso terminado.
   */
  async function sincronizar({ vendedorId, productoId, items, quitados, alAvanzar, alGuardarEstado }) {
    const datos = D();
    const aviso = (texto) => { if (alAvanzar) alAvanzar(texto); };
    const guardado = () => { if (alGuardarEstado) alGuardarEstado(); };

    for (const foto of quitados.slice()) {
      aviso("Quitando una foto…");
      const rutas = rutasDe(vendedorId, productoId, foto);
      const archivos = [];
      if (foto.remoto || foto.hecho.archivo) archivos.push(rutas.path);
      if (foto.remoto || foto.hecho.mini) archivos.push(rutas.thumb_path);
      await datos.quitarArchivos(archivos);
      if (foto.remoto || foto.hecho.fila) await datos.borrarFilaFoto(foto.id);
      quitados.splice(quitados.indexOf(foto), 1);
      guardado();
    }

    for (let i = 0; i < items.length; i += 1) {
      const foto = items[i];
      const rutas = rutasDe(vendedorId, productoId, foto);
      const nombre = items.length > 1 ? `foto ${i + 1} de ${items.length}` : "la foto";
      if (!foto.hecho.archivo) {
        aviso(`Subiendo ${nombre}…`);
        await datos.subirArchivo(rutas.path, foto.blob, foto.mime);
        foto.hecho.archivo = true; guardado();
      }
      if (!foto.hecho.mini) {
        aviso(`Subiendo la miniatura de la ${nombre.replace(/^la /, "")}…`);
        await datos.subirArchivo(rutas.thumb_path, foto.thumb, foto.mime);
        foto.hecho.mini = true; guardado();
      }
      if (!foto.hecho.fila) {
        aviso(`Guardando ${nombre}…`);
        await datos.insertarFoto({ id: foto.id, product_id: productoId, seller_id: vendedorId, position: i, path: rutas.path, thumb_path: rutas.thumb_path, bytes: foto.bytes });
        foto.hecho.fila = true; foto.posicion = i; guardado();
      } else if (foto.posicion !== i) {
        aviso("Ordenando las fotos…");
        await datos.moverFoto(foto.id, i);
        foto.posicion = i; guardado();
      }
    }
  }

  /** ¿Hay algo distinto entre el servidor y la lista? (fotos nuevas, quitadas o reordenadas) */
  function hayCambios(items, quitados) {
    return quitados.length > 0 || items.some((f, i) => !f.remoto || f.posicion !== i);
  }

  // ---------------------------------------------------------------- cuadricula
  /**
   * `items` y `quitados` son listas del dueño (se modifican aqui). `alCambiar(tipo, foto)` avisa: "agregar" | "quitar" | "principal".
   * Devuelve { el, repintar }.
   */
  function cuadricula({ items, quitados, alCambiar }) {
    const { h, icono, avisar, confirmar } = UI();
    const raiz = h("div", { class: "fotos" });
    let preparando = 0;

    const entradaUna = h("input", { type: "file", accept: "image/*", class: "oculto", tabindex: "-1", "aria-hidden": "true" });
    const entradaVarias = h("input", { type: "file", accept: "image/*", multiple: true, class: "oculto", tabindex: "-1", "aria-hidden": "true" });

    async function procesar(archivos) {
      const lugares = U.MAX_FOTOS - items.length - preparando;
      const lista = Array.from(archivos).slice(0, Math.max(0, lugares));
      if (Array.from(archivos).length > lista.length) avisar(`Solo caben ${U.MAX_FOTOS} fotos por producto. Se agregaron las primeras.`, "warn");
      for (const archivo of lista) {
        preparando += 1; pintar();
        try {
          const resultado = await root.VitrinaImagen.comprimir(archivo);
          const foto = deArchivoNuevo(resultado);
          items.push(foto);
          preparando -= 1; pintar();
          alCambiar("agregar", foto);
        } catch (err) {
          preparando -= 1; pintar();
          avisar(err && err.amable ? err.amable : "No pudimos preparar esa foto. Prueba con otra.", "error");
        }
      }
    }

    for (const entrada of [entradaUna, entradaVarias]) {
      entrada.addEventListener("change", () => { const archivos = Array.from(entrada.files || []); entrada.value = ""; if (archivos.length) procesar(archivos); });
    }

    async function quitar(foto) {
      const seguro = await confirmar({
        titulo: "¿Quitar esta foto?", texto: "La foto se quita de este producto.", detalle: foto.remoto ? "Se borrará del todo cuando guardes los cambios." : null,
        si: "Sí, quitar", no: "No, dejarla", peligro: true,
      });
      if (!seguro) return;
      const lugar = items.indexOf(foto);
      if (lugar < 0) return;
      items.splice(lugar, 1);
      if (foto.remoto || foto.hecho.archivo || foto.hecho.mini || foto.hecho.fila) quitados.push(foto);
      else liberar([foto]);
      pintar();
      alCambiar("quitar", foto);
    }

    function hacerPrincipal(foto) {
      const lugar = items.indexOf(foto);
      const nuevo = U.moverAlPrincipio(items, lugar);
      items.splice(0, items.length, ...nuevo);
      pintar();
      alCambiar("principal", foto);
    }

    function fichaFoto(foto, i) {
      const imagen = foto.vista
        ? h("img", { src: foto.vista, alt: `Foto ${i + 1} del producto` })
        : h("span", { class: "foto__vacia" }, icono("imagen", 36));
      const principal = i === 0;
      return h("div", { class: `foto${principal ? " foto--principal" : ""}` },
        h("div", { class: "foto__marco" }, imagen, principal ? h("span", { class: "foto__insignia" }, icono("estrella", 16), "Principal") : null),
        h("p", { class: "foto__nombre", text: `Foto ${i + 1}${foto.remoto ? "" : " · nueva"}` }),
        h("div", { class: "foto__acciones" },
          h("button", { class: "btn btn--claro btn--chico", type: "button", onclick: () => quitar(foto), "aria-label": `Quitar la foto ${i + 1}` }, icono("papelera", 20), "Quitar"),
          principal
            ? h("span", { class: "foto__es-principal" }, icono("visto", 20), "Es la principal")
            : h("button", { class: "btn btn--claro btn--chico", type: "button", onclick: () => hacerPrincipal(foto), "aria-label": `Hacer principal la foto ${i + 1}` }, icono("estrella", 20), "Hacer principal")));
    }

    function fichaVacia(i) {
      const llena = items.length + preparando >= U.MAX_FOTOS;
      return h("button", { class: "foto-vacia", type: "button", disabled: llena || null, onclick: () => entradaUna.click(), "aria-label": `Agregar ${GUIAS[i].toLowerCase()}` },
        icono("camara", 40), h("strong", { text: "Agregar foto" }), h("span", { text: GUIAS[i] }));
    }

    function pintar() {
      const hijos = items.map(fichaFoto);
      for (let n = 0; n < preparando; n += 1) {
        hijos.push(h("div", { class: "foto-preparando", role: "status" }, h("span", { class: "rueda", "aria-hidden": "true" }), h("span", { text: "Preparando la foto…" })));
      }
      for (let i = items.length + preparando; i < U.MAX_FOTOS; i += 1) hijos.push(fichaVacia(i));
      const lugares = U.MAX_FOTOS - items.length - preparando;
      raiz.replaceChildren(
        h("div", { class: "fotos__rejilla" }, hijos),
        lugares > 0 ? h("div", { class: "fotos__mas" },
          h("button", { class: "btn btn--claro btn--bloque", type: "button", onclick: () => entradaVarias.click() }, icono("imagen", 22), "Elegir varias de mi galería"),
          h("p", { class: "ayuda", text: `Puedes poner hasta ${U.MAX_FOTOS} fotos. La primera es la que se ve en la web.` })) : h("p", { class: "ayuda", text: `Ya tienes las ${U.MAX_FOTOS} fotos. Para cambiar una, quítala y agrega otra.` }),
        entradaUna, entradaVarias);
    }

    pintar();
    return { el: raiz, repintar: pintar };
  }

  root.VitrinaFotos = { GUIAS, deFilaRemota, deArchivoNuevo, liberar, sincronizar, hayCambios, cuadricula };
})(window);
