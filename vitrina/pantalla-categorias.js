/*
 * Pantalla «Categorías»: secciones con sus colecciones anidadas, cuantos productos tiene cada una; crear, renombrar y borrar.
 * Una colección siempre vive dentro de una sección (2 niveles). Los nombres repetidos los rechaza la base (23505) y aqui se explica con amabilidad.
 */
(function (root) {
  "use strict";
  const App = root.VitrinaApp;
  const U = root.VitrinaUtil;
  const D = root.VitrinaDatos;
  const UI = root.VitrinaUI;
  const { h, icono, avisar } = UI;

  const contar = (n) => `${n} ${U.plural(n, "producto", "productos")}`;

  App.pantallas.categorias = {
    async montar(raiz) {
      App.barra({ atras: "#/mas" });
      let cat = await App.cargarCategorias(true);
      let conteo = await D.conteoPorCategoria();
      const zona = h("div", { class: "categorias" });

      async function refrescar() {
        try {
          [cat, conteo] = await Promise.all([App.cargarCategorias(true), D.conteoPorCategoria()]);
          pintar();
        } catch (err) { App.manejarError(err); }
      }

      async function crearSeccion() {
        const r = await UI.formularioTexto({
          titulo: "Nueva sección", etiqueta: "Nombre de la sección", ejemplo: "Funko Pop", ayuda: "Por ejemplo: Funko Pop, Mangas, Libros.", boton: "Crear sección",
          maximo: 60, duplicado: "Ya tienes una sección con ese nombre.",
          alGuardar: (nombre) => D.crearSeccion(App.tienda.id, nombre),
        });
        if (r === undefined) return;
        avisar(`Sección «${r.name || r}» creada. ✔`);
        await refrescar();
      }

      async function crearColeccion(seccion) {
        const r = await UI.formularioTexto({
          titulo: `Nueva colección en «${seccion.name}»`, etiqueta: "Nombre de la colección", ejemplo: "Harry Potter", ayuda: "Por ejemplo: Harry Potter, Dragon Ball, Marvel.", boton: "Crear colección",
          maximo: 60, duplicado: "Ya tienes una colección con ese nombre en esta sección.",
          alGuardar: (nombre) => D.crearColeccion(App.tienda.id, seccion.id, nombre),
        });
        if (r === undefined) return;
        avisar(`Colección «${r.name || r}» creada. ✔`);
        await refrescar();
      }

      async function renombrar(item, esSeccion) {
        const r = await UI.formularioTexto({
          titulo: esSeccion ? "Cambiar el nombre de la sección" : "Cambiar el nombre de la colección", etiqueta: "Nombre nuevo", valor: item.name, boton: "Guardar",
          maximo: 60, duplicado: esSeccion ? "Ya tienes una sección con ese nombre." : "Ya tienes una colección con ese nombre en esta sección.",
          alGuardar: (nombre) => (nombre === item.name ? item : esSeccion ? D.renombrarSeccion(item.id, nombre) : D.renombrarColeccion(item.id, nombre)),
        });
        if (r === undefined) return;
        avisar("Nombre cambiado. ✔");
        await refrescar();
      }

      async function borrarSeccion(seccion) {
        const colecciones = cat.colecciones.filter((c) => c.section_id === seccion.id);
        const productos = conteo.porSeccion[seccion.id] || 0;
        const partes = [];
        if (colecciones.length) partes.push(`También se ${U.plural(colecciones.length, "borra la colección", "borran sus colecciones")} (${colecciones.map((c) => c.name).join(", ")}).`);
        partes.push(productos === 1 ? "Tu producto NO se borra: queda sin sección ni colección y tendrás que elegirle una."
          : productos ? `Tus ${productos} productos NO se borran: quedan sin sección ni colección y tendrás que elegirles una.` : "No tiene productos.");
        const seguro = await UI.confirmar({
          titulo: `¿Borrar la sección «${seccion.name}»?`, texto: partes.join(" "), detalle: "No se puede deshacer.", si: "Sí, borrar la sección", no: "No, dejarla", peligro: true,
        });
        if (!seguro) return;
        try { await D.borrarSeccion(seccion.id); avisar("Sección borrada."); await refrescar(); } catch (err) { App.manejarError(err); }
      }

      async function borrarColeccion(coleccion) {
        const productos = conteo.porColeccion[coleccion.id] || 0;
        const seguro = await UI.confirmar({
          titulo: `¿Borrar la colección «${coleccion.name}»?`,
          texto: productos === 1 ? "Tu producto NO se borra: se queda en su sección, sin colección."
            : productos ? `Tus ${productos} productos NO se borran: se quedan en su sección, sin colección.` : "No tiene productos.",
          detalle: "No se puede deshacer.", si: "Sí, borrar la colección", no: "No, dejarla", peligro: true,
        });
        if (!seguro) return;
        try { await D.borrarColeccion(coleccion.id); avisar("Colección borrada."); await refrescar(); } catch (err) { App.manejarError(err); }
      }

      const acciones = (alRenombrar, alBorrar, nombre) => h("div", { class: "acciones-par" },
        h("button", { class: "btn btn--claro btn--chico", type: "button", onclick: alRenombrar, "aria-label": `Cambiar el nombre de ${nombre}` }, icono("lapiz", 20), "Cambiar nombre"),
        h("button", { class: "btn btn--peligro-claro btn--chico", type: "button", onclick: alBorrar, "aria-label": `Borrar ${nombre}` }, icono("papelera", 20), "Borrar"));

      function pintar() {
        if (!cat.secciones.length) {
          zona.replaceChildren(UI.vacio("Todavía no tienes secciones", "Una sección agrupa tus productos, por ejemplo «Funko Pop» o «Mangas».", null));
          return;
        }
        zona.replaceChildren(...cat.secciones.map((s) => {
          const hijas = cat.colecciones.filter((c) => c.section_id === s.id);
          return h("section", { class: "categoria" },
            h("div", { class: "categoria__cabeza" }, h("span", { class: "categoria__icono" }, icono("carpeta", 28)),
              h("div", {}, h("h2", { text: s.name }), h("span", { class: "categoria__conteo", text: `${contar(conteo.porSeccion[s.id] || 0)} · ${hijas.length} ${U.plural(hijas.length, "colección", "colecciones")}` }))),
            acciones(() => renombrar(s, true), () => borrarSeccion(s), s.name),
            hijas.length ? h("ul", { class: "categoria__hijas" }, hijas.map((c) => h("li", { class: "subcategoria" },
              h("div", { class: "subcategoria__nombre" }, h("strong", { text: c.name }), h("span", { class: "categoria__conteo", text: contar(conteo.porColeccion[c.id] || 0) })),
              acciones(() => renombrar(c, false), () => borrarColeccion(c), c.name)))) : h("p", { class: "ayuda", text: "Esta sección todavía no tiene colecciones." }),
            h("button", { class: "btn btn--claro btn--bloque", type: "button", onclick: () => crearColeccion(s) }, icono("mas_", 22), "Agregar una colección"));
        }));
      }

      pintar();
      raiz.append(h("h1", { text: "Categorías" }),
        h("p", { class: "subtitulo", text: "Las secciones agrupan tus productos. Dentro de cada sección puedes tener colecciones." }),
        h("button", { class: "btn btn--primario btn--bloque btn--alto", type: "button", onclick: crearSeccion }, icono("mas_", 24), "Crear una sección"),
        zona);
    },
  };
})(window);
