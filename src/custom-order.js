/*
 * Formulario "Pedido a medida" (#personalizado): el cliente deja nombre,
 * teléfono, correo y su idea SIN salir de la web. El envío va por Web3Forms
 * al correo de BoomArt. Igual que el formulario de opiniones: el <form> tiene
 * action/method nativos, así que funciona aunque el JS esté bloqueado; este
 * script solo lo mejora para quedarse en la página con un mensaje de gracias.
 */
(function () {
  "use strict";

  var WEB3FORMS_KEY = "783f87b9-117e-4bf1-889c-094f12205cc5";

  var form = document.querySelector("#customOrderForm");
  if (!form) return;

  var statusEl = form.querySelector("#customOrderStatus");
  var submitBtn = form.querySelector('button[type="submit"]');

  function showStatus(message, kind) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = "review-form-status" + (kind ? " is-" + kind : "");
    statusEl.hidden = !message;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    if (form.querySelector('input[name="botcheck"]').checked) return;

    if (!form.checkValidity()) {
      showStatus("Completa tu nombre, teléfono y tu idea.", "error");
      form.reportValidity();
      return;
    }

    var data = new FormData(form);
    if (!data.get("access_key")) data.append("access_key", WEB3FORMS_KEY);

    submitBtn.disabled = true;
    showStatus("Enviando...", "");

    fetch("https://api.web3forms.com/submit", { method: "POST", body: data })
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        if (json.success) {
          form.reset();
          showStatus(
            "¡Recibimos tu idea! Te escribimos pronto por WhatsApp o correo para coordinar los detalles y el precio.",
            "ok",
          );
        } else {
          showStatus(
            "No se pudo enviar. Escríbenos por WhatsApp y con gusto tomamos tu pedido.",
            "error",
          );
        }
      })
      .catch(function () {
        showStatus(
          "No se pudo enviar. Revisa tu conexión o escríbenos por WhatsApp.",
          "error",
        );
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  });
})();
