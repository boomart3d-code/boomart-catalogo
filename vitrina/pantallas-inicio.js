/*
 * Pantallas: Inicio, Más, Mi tienda y Ayuda.
 */
(function (root) {
  "use strict";
  const App = root.VitrinaApp;
  const U = root.VitrinaUtil;
  const D = root.VitrinaDatos;
  const { h, icono, avisar } = root.VitrinaUI;
  const UI = root.VitrinaUI;

  function botonGrande(href, nombreIcono, titulo, texto, clase) {
    return h("a", { class: `grande ${clase || ""}`.trim(), href },
      h("span", { class: "grande__icono" }, icono(nombreIcono, 40)),
      h("span", { class: "grande__texto" }, h("strong", { text: titulo }), h("span", { text: texto })));
  }

  function fichaNumero(clave, numero, texto, alerta) {
    return h("a", { class: `numero${alerta && numero > 0 ? " numero--alerta" : ""}`, href: `#/productos?f=${clave}`, "aria-label": `${texto}: ${numero}. Tocar para ver.` },
      h("span", { class: "numero__valor", text: String(numero) }), h("span", { class: "numero__texto", text: texto }));
  }

  // ---------------------------------------------------------------- Inicio
  App.pantallas.inicio = {
    async montar(raiz) {
      const tienda = App.tienda;
      const [conteos, cambios, sinEnviar] = await Promise.allSettled([D.contarEstados(), D.productosConCambios(3), D.productosSinEnviar()]);
      for (const r of [conteos, cambios, sinEnviar]) if (r.status === "rejected" && App.esErrorDeSesion(r.reason)) throw r.reason;

      raiz.append(h("h1", { class: "saludo", text: `Hola, ${tienda.name}` }), h("p", { class: "subtitulo", text: "¿Qué quieres hacer hoy?" }));

      if (cambios.status === "fulfilled" && cambios.value.length) {
        const total = conteos.status === "fulfilled" ? conteos.value.cambios_pedidos : cambios.value.length;
        raiz.append(h("section", { class: "alerta", "aria-label": "BoomArt pide cambios" },
          h("h2", { class: "alerta__titulo" }, icono("aviso", 26), total === 1 ? "BoomArt te pide un cambio" : `BoomArt te pide cambios en ${total} productos`),
          ...cambios.value.map((p) => h("div", { class: "alerta__item" },
            h("strong", { text: p.title || "Producto sin nombre" }),
            h("p", { class: "alerta__nota", text: p.review_note ? `«${p.review_note}»` : "BoomArt no dejó un mensaje. Revisa el producto." }),
            h("a", { class: "btn btn--primario btn--bloque", href: `#/producto/${p.id}` }, icono("lapiz", 22), "Arreglarlo"))),
          total > cambios.value.length ? h("a", { class: "enlace", href: "#/productos?f=cambios_pedidos", text: `Ver los ${total}` }) : null));
      }

      raiz.append(h("div", { class: "grandes" },
        botonGrande("#/publicar", "publicar", "Publicar un producto", "Con fotos, precio y cantidad", "grande--principal"),
        botonGrande("#/stock", "stock", "Mi stock", "Cambiar cuántos tienes"),
        botonGrande("#/productos", "productos", "Mis productos", "Ver, cambiar o borrar")));

      if (conteos.status === "fulfilled") {
        const c = conteos.value;
        raiz.append(h("section", { "aria-labelledby": "t-resumen" },
          h("h2", { id: "t-resumen", class: "seccion", text: "Cómo van tus productos" }),
          h("div", { class: "numeros" },
            fichaNumero("borrador", c.borrador, "Sin enviar"),
            fichaNumero("en_validacion", c.en_validacion, "Esperando a BoomArt"),
            fichaNumero("aprobado", c.aprobado, "Publicados"),
            fichaNumero("cambios_pedidos", c.cambios_pedidos, "BoomArt pide cambios", true))));
        const listos = sinEnviar.status === "fulfilled"
          ? sinEnviar.value.filter((p) => U.listoParaEnviar(p, (p.product_photos || []).length).ok).length : null;
        if (listos === null ? c.borrador > 0 : listos > 0) {
          raiz.append(h("a", { class: "btn btn--primario btn--bloque btn--alto", href: "#/validar" }, icono("enviar", 24), `Mandar a validar (${listos === null ? c.borrador : listos})`),
            h("p", { class: "ayuda", text: "BoomArt revisa lo que mandes y lo publica en la web." }));
        } else if (c.borrador > 0) {
          raiz.append(h("div", { class: "nota" }, h("p", { text: `Tienes ${c.borrador} ${U.plural(c.borrador, "producto sin enviar", "productos sin enviar")}, pero les falta algo (foto, precio o sección).` }),
            h("a", { class: "btn btn--claro btn--bloque", href: "#/validar" }, "Ver qué les falta")));
        }
        if (c.todos === 0) {
          raiz.append(h("div", { class: "nota" }, h("p", { text: "Todavía no publicaste nada. Toca «Publicar un producto» para empezar con el primero." })));
        }
      } else {
        raiz.append(UI.panelError(U.mensajeAmable(conteos.reason), () => App.recargarPantalla()));
      }
    },
  };

  // ---------------------------------------------------------------- Más
  function filaMenu({ href, nombreIcono, titulo, texto, alTocar, peligro }) {
    const contenido = [
      h("span", { class: "fila-menu__icono" }, icono(nombreIcono, 30)),
      h("span", { class: "fila-menu__texto" }, h("strong", { text: titulo }), texto ? h("span", { text: texto }) : null),
      h("span", { class: "fila-menu__flecha" }, icono("derecha", 22)),
    ];
    return href ? h("a", { class: "fila-menu", href }, ...contenido)
      : h("button", { class: `fila-menu${peligro ? " fila-menu--peligro" : ""}`, type: "button", onclick: alTocar }, ...contenido);
  }

  App.pantallas.mas = {
    async montar(raiz) {
      raiz.append(h("h1", { text: "Más" }),
        h("nav", { class: "menu-lista", "aria-label": "Más opciones" },
          filaMenu({ href: "#/mas/tienda", nombreIcono: "tienda", titulo: "Mi tienda", texto: "Dirección, horario y WhatsApp" }),
          filaMenu({ href: "#/categorias", nombreIcono: "carpeta", titulo: "Categorías", texto: "Secciones y colecciones" }),
          filaMenu({ href: "#/mas/ayuda", nombreIcono: "ayuda", titulo: "Ayuda", texto: "Cómo usar tu vitrina" }),
          filaMenu({ nombreIcono: "salir", titulo: "Salir", texto: "Cerrar tu sesión", alTocar: () => App.salir(), peligro: true })),
        h("p", { class: "ayuda ayuda--centro", text: `Tienda: ${App.tienda.name}` }));
    },
  };

  // ---------------------------------------------------------------- Mi tienda
  App.pantallas.tienda = {
    async montar(raiz) {
      App.barra({ atras: "#/mas" });
      const t = App.tienda;
      const whatsapp = h("input", { class: "entrada", type: "text", inputmode: "numeric", autocomplete: "off", maxlength: "20", placeholder: "51999999999", value: t.whatsapp || "" });
      const direccion = h("input", { class: "entrada", type: "text", autocomplete: "off", maxlength: "200", placeholder: "Ej.: C.C. Arenales, piso 1", value: t.address || "" });
      const horario = h("input", { class: "entrada", type: "text", autocomplete: "off", maxlength: "200", placeholder: "Ej.: Lunes a sábado, de 10:00 a 20:00", value: t.hours || "" });
      const acerca = h("textarea", { class: "entrada entrada--area", rows: "4", maxlength: "500", placeholder: "Cuenta en pocas palabras quién eres y qué vendes." });
      acerca.value = t.about || "";
      const error = h("p", { class: "error", role: "alert", hidden: true });
      const guardar = h("button", { class: "btn btn--primario btn--bloque btn--alto", type: "submit", text: "Guardar mi tienda" });
      const actual = () => ({ whatsapp: whatsapp.value, address: direccion.value, hours: horario.value, about: acerca.value });
      const inicial = JSON.stringify(actual());
      App.guardia = () => JSON.stringify(actual()) !== inicial;

      const form = h("form", { class: "formulario", novalidate: true },
        h("div", { class: "tarjeta-fija" }, h("span", { class: "etiqueta-chica", text: "Nombre de la tienda" }), h("strong", { text: t.name }), h("small", { text: "Este nombre lo cambia BoomArt." })),
        UI.campo("WhatsApp de la tienda", whatsapp, "Solo números, con el código de país. Ejemplo: 51999999999. No se muestra en las fichas de la web."),
        UI.campo("Dirección", direccion), UI.campo("Horario", horario), UI.campo("Sobre tu tienda", acerca),
        error, guardar);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        error.hidden = true;
        const wa = U.parseWhatsapp(whatsapp.value);
        if (!wa.ok) { error.textContent = "El WhatsApp debe tener solo números, con el código de país. Ejemplo: 51999999999."; error.hidden = false; whatsapp.focus(); return; }
        try {
          const fila = await UI.trabajando(guardar, "Guardando…", () => D.guardarTienda(t.id, {
            whatsapp: wa.valor, address: direccion.value.trim(), hours: horario.value.trim(), about: acerca.value.trim(),
          }));
          App.tienda = fila;
          whatsapp.value = fila.whatsapp || "";
          const guardado = JSON.stringify(actual());
          App.guardia = () => JSON.stringify(actual()) !== guardado;
          avisar("Guardado. Los datos de tu tienda están al día. ✔");
        } catch (err) {
          App.manejarError(err);
        }
      });
      raiz.append(h("h1", { text: "Mi tienda" }), form);
    },
  };

  // ---------------------------------------------------------------- Ayuda
  const PASOS_AYUDA = [
    ["Publicar un producto", "Toca «Publicar» abajo. Son 4 pasos cortos: las fotos, qué es, el precio y la cantidad, y la descripción. Arriba ves en qué paso estás."],
    ["Las fotos", "Toca el cuadro para sacar la foto con la cámara o elegirla de tu galería. La primera foto es la del frente de la caja; la segunda, la figura; la tercera, un detalle (como el número). Pon la figura sobre un fondo claro y con buena luz."],
    ["Qué es", "Escribe el nombre, por ejemplo «Funko Pop Harry Potter #01». Luego elige la sección (por ejemplo Funko Pop) y la colección (por ejemplo Harry Potter). Si no existe, toca «Crear nueva»."],
    ["Precio y cantidad", "Escribe el precio en soles y cuántas unidades tienes con los botones − y +. Si tu stock cambia mucho, deja apagada la casilla de mostrar unidades: la web dirá solo «Disponible» o «Agotado»."],
    ["Mandar a validar", "Lo que guardas queda como borrador, solo tú lo ves. Cuando esté listo, toca «Mandar a validar». BoomArt lo revisa y lo publica en la web. Después avísale a Adrián que ya lo mandaste."],
    ["Stock, precio y cambios", "En «Stock» cambias cuántos te quedan o marcas «Agotado»: se ve en la web al instante. El precio también cambia al instante. El nombre, la descripción, las fotos y la sección esperan a que BoomArt los revise."],
  ];

  App.pantallas.ayuda = {
    async montar(raiz) {
      App.barra({ atras: "#/mas" });
      raiz.append(h("h1", { text: "Ayuda" }), h("p", { class: "subtitulo", text: "Seis pasos para usar tu vitrina." }),
        h("ol", { class: "pasos-ayuda" }, PASOS_AYUDA.map(([titulo, texto], i) => h("li", { class: "paso-ayuda" },
          h("span", { class: "paso-ayuda__num", "aria-hidden": "true", text: String(i + 1) }),
          h("div", {}, h("h2", { text: titulo }), h("p", { text: texto }))))),
        h("div", { class: "nota" },
          h("strong", { text: "¿Se cortó el internet?" }),
          h("p", { text: "No pasa nada. Lo que escribiste y las fotos que ya preparaste quedan guardados en tu celular. Cuando vuelva la señal, toca «Guardar» o «Reintentar»." })),
        h("div", { class: "nota" }, h("strong", { text: "¿Algo no funciona?" }), h("p", { text: "Escríbele a Adrián, de BoomArt, y cuéntale qué estabas haciendo." })));
    },
  };
})(window);
