/*
 * Carga el catalogo desde data/products.json (el archivo que edita el panel de
 * administracion) y avisa a app.js cuando ya esta listo para dibujar la pagina.
 * Si el archivo no carga por algun motivo, sigue con un catalogo vacio en vez
 * de dejar la pagina en blanco.
 */
(function () {
  "use strict";

  function ready(products) {
    window.BOOMART_PRODUCTS = Array.isArray(products) ? products : [];
    document.dispatchEvent(new CustomEvent("boomart:products-ready"));
  }

  fetch("data/products.json", { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("No se pudo cargar data/products.json");
      return response.json();
    })
    .then(ready)
    .catch((err) => {
      console.error("BoomArt: error cargando el catalogo", err);
      ready([]);
    });
})();
