/*
 * Seccion "Opiniones de clientes" (#opiniones).
 *  - Dibuja el resumen (promedio + total de estrellas) y la lista de opiniones
 *    aprobadas que entrega reviews-loader.js en window.BOOMART_REVIEWS.
 *  - Maneja el formulario "Deja tu opinion": el visitante puntua con estrellas
 *    y escribe un comentario; el envio va por Web3Forms al correo de BoomArt.
 *    Nada se publica solo: BoomArt revisa el correo y sube las opiniones reales
 *    desde el panel de administracion.
 */
(function () {
  "use strict";

  var WEB3FORMS_KEY = "783f87b9-117e-4bf1-889c-094f12205cc5";
  var GOOGLE_REVIEW_URL = "https://search.google.com/local/writereview?placeid=";
  var GOOGLE_PROFILE_URL = "https://share.google/1EB41G5DoHVk4GWhA";

  var summaryEl = document.querySelector("#reviewsSummary");
  var listEl = document.querySelector("#reviewsList");
  var listWrapEl = document.querySelector("#reviewsListWrap");
  var form = document.querySelector("#reviewForm");
  if (!form && !summaryEl) return;

  /* ---------------------------------------------------------------- utilidades */
  function starRow(rating) {
    var value = Number(rating) || 0;
    var full = Math.floor(value);
    var half = value - full >= 0.3 && value - full < 0.8;
    var out = "";
    for (var i = 1; i <= 5; i++) {
      var cls = i <= full ? " is-on" : i === full + 1 && half ? " is-half" : "";
      out += '<span class="star' + cls + '">★</span>';
    }
    return '<span class="stars" aria-hidden="true">' + out + "</span>";
  }

  function fmtDate(value) {
    if (!value) return "";
    var d = new Date(value + "T00:00:00");
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-PE", {
      year: "numeric",
      month: "long",
    });
  }

  function esc(str) {
    return String(str || "").replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  /* ---------------------------------------------------------------- render */
  function render() {
    var reviews = Array.isArray(window.BOOMART_REVIEWS)
      ? window.BOOMART_REVIEWS.slice()
      : [];

    if (summaryEl) {
      if (reviews.length) {
        var avg =
          reviews.reduce(function (sum, r) {
            return sum + Number(r.rating);
          }, 0) / reviews.length;
        var rounded = Math.round(avg * 10) / 10;
        summaryEl.innerHTML =
          '<span class="reviews-score">' +
          rounded.toFixed(1).replace(".", ",") +
          "</span>" +
          starRow(avg) +
          '<span class="reviews-count">' +
          reviews.length +
          (reviews.length === 1 ? " opinion" : " opiniones") +
          "</span>";
        summaryEl.hidden = false;
      } else {
        summaryEl.hidden = true;
      }
    }

    if (listEl) {
      if (reviews.length) {
        reviews.sort(function (a, b) {
          return String(b.date || "").localeCompare(String(a.date || ""));
        });
        listEl.innerHTML = reviews
          .map(function (r) {
            var meta = [r.city, fmtDate(r.date)].filter(Boolean).join(" · ");
            return (
              '<li class="review-card">' +
              '<div class="review-card-head">' +
              '<strong>' +
              esc(r.name || "Cliente BoomArt") +
              "</strong>" +
              starRow(r.rating) +
              "</div>" +
              (meta ? '<p class="review-card-meta">' + esc(meta) + "</p>" : "") +
              '<p class="review-card-text">' +
              esc(r.text || "") +
              "</p>" +
              (r.product
                ? '<p class="review-card-product">Compró: ' +
                  esc(r.product) +
                  "</p>"
                : "") +
              "</li>"
            );
          })
          .join("");
        if (listWrapEl) listWrapEl.hidden = false;
      } else if (listWrapEl) {
        listWrapEl.hidden = true;
      }
    }
  }

  document.addEventListener("boomart:reviews-ready", render);
  if (window.BOOMART_REVIEWS) render();

  /* ---------------------------------------------------------------- formulario */
  if (!form) return;

  var starInput = form.querySelector(".star-input");
  var ratingField = form.querySelector('input[name="Puntuación"]');
  var statusEl = form.querySelector("#reviewFormStatus");
  var submitBtn = form.querySelector('button[type="submit"]');
  var currentRating = 0;

  function paintStars(value) {
    var btns = starInput.querySelectorAll("button");
    btns.forEach(function (b, i) {
      b.classList.toggle("is-on", i < value);
      b.setAttribute("aria-checked", String(i + 1 === value));
    });
  }

  if (starInput) {
    starInput.addEventListener("click", function (event) {
      var btn = event.target.closest("button");
      if (!btn) return;
      currentRating = Number(btn.dataset.value);
      ratingField.value = currentRating + " de 5";
      paintStars(currentRating);
    });
    starInput.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      currentRating = Math.min(
        5,
        Math.max(1, currentRating + (event.key === "ArrowRight" ? 1 : -1)),
      );
      ratingField.value = currentRating + " de 5";
      paintStars(currentRating);
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    // Honeypot: si el campo oculto viene lleno, es un bot.
    if (form.querySelector('input[name="botcheck"]').checked) return;

    if (!currentRating) {
      showStatus("Elige cuántas estrellas le das (1 a 5).", "error");
      return;
    }

    var data = new FormData(form);
    data.append("access_key", WEB3FORMS_KEY);
    data.append("subject", "Nueva opinión en boomart.pe");
    data.append("from_name", "Opiniones BoomArt");

    submitBtn.disabled = true;
    showStatus("Enviando...", "");

    fetch("https://api.web3forms.com/submit", {
      method: "POST",
      body: data,
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        if (json.success) {
          form.reset();
          currentRating = 0;
          paintStars(0);
          showStatus(
            "¡Gracias! Tu opinión llegó a BoomArt y se publicará tras una breve revisión.",
            "ok",
          );
        } else {
          showStatus(
            "No se pudo enviar. Escríbenos por WhatsApp y con gusto tomamos tu opinión.",
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

  function showStatus(message, kind) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = "review-form-status" + (kind ? " is-" + kind : "");
    statusEl.hidden = !message;
  }

  // Expuesto por si luego se agrega el Place ID de Google Business.
  window.BOOMART_GOOGLE_REVIEW = { write: GOOGLE_REVIEW_URL, profile: GOOGLE_PROFILE_URL };
})();
