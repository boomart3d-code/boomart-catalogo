/*
 * Pantalla «Mi stock»: buscador y una fila por producto con − cantidad + y «Agotado».
 * Cada toque se guarda solo (con una espera corta para juntar varios toques) y aparece «Guardado ✔».
 * La cantidad cambia al instante en la web y NO pide revision de BoomArt. Si no se puede guardar, la cantidad vuelve a la de antes.
 */
(function (root) {
  "use strict";
  const App = root.VitrinaApp;
  const U = root.VitrinaUtil;
  const D = root.VitrinaDatos;
  const UI = root.VitrinaUI;
  const { h, icono } = UI;
  const ESPERA_MS = 700;

  const memoria = { texto: "", agotados: false };

  function filaStock(p) {
    let confirmado = p.qty;
    let actual = p.qty;
    let reloj = null;
    let borrarMarca = null;
    const marca = h("span", { class: "guardado", "aria-live": "polite" });
    const portada = U.fotoPortada(p.product_photos);

    function decir(texto, clase) {
      clearTimeout(borrarMarca);
      marca.textContent = texto;
      marca.className = `guardado${clase ? ` guardado--${clase}` : ""}`;
      if (clase === "ok") borrarMarca = setTimeout(() => { marca.textContent = ""; }, 3000);
    }

    async function guardar() {
      reloj = null;
      const valor = actual;
      if (valor === confirmado) { decir(""); return; }
      try {
        await D.actualizarProducto(p.id, { qty: valor });
        confirmado = valor;
        if (actual === valor) decir("Guardado ✔", "ok");
      } catch (err) {
        actual = confirmado;
        contador.poner(confirmado, false);
        agotado.hidden = confirmado === 0;
        decir("No se guardó", "error");
        App.manejarError(err);
      }
    }

    const contador = UI.contador({
      valor: p.qty, min: 0, max: U.CANTIDAD_MAXIMA, etiqueta: `Cantidad de ${p.title}`,
      alCambiar: (n) => { actual = n; agotado.hidden = n === 0; decir("Guardando…"); clearTimeout(reloj); reloj = setTimeout(guardar, ESPERA_MS); },
    });
    const agotado = h("button", { class: "btn btn--claro btn--chico", type: "button", hidden: p.qty === 0 || null, "aria-label": `Marcar «${p.title}» como agotado`, onclick: () => contador.poner(0) }, "Agotado");

    return h("div", { class: `fila-stock${p.qty === 0 ? " fila-stock--agotado" : ""}` },
      h("div", { class: "fila-stock__arriba" },
        UI.miniatura(portada && portada.thumb_path, "miniatura--chica"),
        h("div", { class: "fila-stock__nombre" }, h("strong", { text: p.title || "Sin nombre" }), marca)),
      h("div", { class: "fila-stock__abajo" }, contador.el, agotado));
  }

  App.pantallas.stock = {
    olvidar() { memoria.texto = ""; memoria.agotados = false; },
    async montar(raiz) {
      let filas = [];
      let peticion = 0;
      const buscador = h("input", { class: "entrada entrada--buscar", type: "search", placeholder: "Buscar por nombre…", "aria-label": "Buscar un producto por nombre", autocomplete: "off", enterkeyhint: "search", value: memoria.texto });
      const lista = h("div", { class: "lista-stock" });
      const pie = h("div", { class: "pie-lista" });
      const chips = h("div", { class: "chips", role: "group", "aria-label": "Filtrar" });

      function pintarChips() {
        chips.replaceChildren(
          h("button", { class: `chip${!memoria.agotados ? " es-activo" : ""}`, type: "button", "aria-pressed": !memoria.agotados ? "true" : "false", onclick: () => { memoria.agotados = false; pintarChips(); cargar(true); } }, "Todos"),
          h("button", { class: `chip${memoria.agotados ? " es-activo" : ""}`, type: "button", "aria-pressed": memoria.agotados ? "true" : "false", onclick: () => { memoria.agotados = true; pintarChips(); cargar(true); } }, "Agotados"));
      }

      async function cargar(reiniciar) {
        const mia = ++peticion;
        if (reiniciar) { filas = []; lista.replaceChildren(UI.cargando("Buscando…")); pie.replaceChildren(); } else pie.replaceChildren(UI.cargando("Cargando más…"));
        try {
          const r = await D.listarProductos({ filtro: "todos", texto: memoria.texto, desde: filas.length, cantidad: 30, orden: "nombre", soloAgotados: memoria.agotados });
          if (mia !== peticion) return;
          filas = filas.concat(r.filas);
          if (reiniciar) lista.replaceChildren();
          lista.append(...r.filas.map(filaStock));
          if (!filas.length) {
            lista.replaceChildren(memoria.texto.trim() || memoria.agotados
              ? UI.vacio(memoria.agotados && !memoria.texto.trim() ? "No tienes productos agotados" : "No encontramos ese producto", "Prueba con otra palabra o cambia el filtro.")
              : UI.vacio("Todavía no tienes productos", "Cuando publiques el primero, aquí podrás cambiar cuántos te quedan.", h("a", { class: "btn btn--primario btn--bloque", href: "#/publicar" }, icono("publicar", 22), "Publicar un producto")));
          }
          pie.replaceChildren(...(r.hayMas ? [h("button", { class: "btn btn--claro btn--bloque", type: "button", onclick: () => cargar(false) }, "Ver más productos")] : []));
          if (r.filas.length) UI.cargarMiniaturas(lista);
        } catch (err) {
          if (mia !== peticion) return;
          if (App.esErrorDeSesion(err)) { App.sesionVencida(); return; }
          pie.replaceChildren();
          lista.replaceChildren(UI.panelError(U.mensajeAmable(err), () => cargar(true)));
        }
      }

      const buscar = UI.retrasar(() => { memoria.texto = buscador.value; cargar(true); }, 350);
      buscador.addEventListener("input", buscar);
      buscador.addEventListener("search", () => { buscar.cancelar(); memoria.texto = buscador.value; cargar(true); });
      raiz.append(h("h1", { text: "Mi stock" }),
        h("p", { class: "subtitulo", text: "Toca − o + para cambiar cuántos te quedan. Se guarda solo y se ve en la web al instante." }),
        h("div", { class: "buscar" }, icono("buscar", 24), buscador), chips, lista, pie);
      pintarChips();
      await cargar(true);
      return { limpiar() { buscar.cancelar(); peticion += 1; } };
    },
  };
})(window);
