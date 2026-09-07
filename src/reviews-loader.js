/*
 * Carga las opiniones de clientes desde data/reviews.json (el archivo que se
 * edita en el panel de administracion) y avisa a reviews.js cuando ya estan
 * listas para dibujarse. Si el archivo no carga, sigue con una lista vacia:
 * la seccion "Opiniones" simplemente mostrara solo el formulario.
 *
 * Formato de cada opinion en data/reviews.json:
 *   {
 *     "name": "Adrian O.",          // nombre publico (nombre + inicial)
 *     "city": "Lima",               // ciudad (opcional)
 *     "rating": 5,                  // 1 a 5
 *     "text": "Quede feliz con...", // comentario
 *     "date": "2026-09-07",         // AAAA-MM-DD
 *     "product": "Templo de Aries", // opcional
 *     "approved": true              // solo se muestran las aprobadas
 *   }
 */
(function () {
  "use strict";

  function ready(list) {
    var reviews = Array.isArray(list) ? list : [];
    // Solo las aprobadas y con texto/estrellas validas llegan a la web.
    window.BOOMART_REVIEWS = reviews.filter(function (r) {
      return (
        r &&
        r.approved !== false &&
        Number(r.rating) >= 1 &&
        Number(r.rating) <= 5
      );
    });
    document.dispatchEvent(new CustomEvent("boomart:reviews-ready"));
  }

  fetch("data/reviews.json", { cache: "no-cache" })
    .then(function (response) {
      if (!response.ok) throw new Error("No se pudo cargar data/reviews.json");
      return response.json();
    })
    .then(ready)
    .catch(function (err) {
      console.error("BoomArt: error cargando las opiniones", err);
      ready([]);
    });
})();
