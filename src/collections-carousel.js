// «Explora por colección» como carrusel (pedido de Adrián, 2026-10-18).
// - Avanza solo una categoría cada 1,5 s, en bucle continuo (el primer mosaico pasa
//   al final; los mosaicos siguen siendo los mismos botones data-filter de app.js).
// - Se detiene mientras el mouse (o el dedo / el foco del teclado) está encima.
// - Botones ‹ › para recorrer a mano; en el celular también se desliza con el dedo.
// - Con «reducir movimiento» activado en el sistema no avanza solo.
(function () {
  "use strict";
  const root = document.querySelector("[data-carousel]");
  if (!root) return;
  const track = root.querySelector(".collections-grid");
  const viewport = root.querySelector(".collections-viewport");
  const prevBtn = root.querySelector("[data-carousel-prev]");
  const nextBtn = root.querySelector("[data-carousel-next]");
  if (!track || !viewport) return;

  const INTERVAL = 1500;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DURATION = reduceMotion ? 0 : 550;
  let busy = false;
  let timer = null;
  let paused = false;
  let visible = true;

  const tiles = () => [...track.children].filter((el) => !el.hidden);
  const stepSize = () => {
    const first = tiles()[0];
    if (!first) return 0;
    const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
    return first.getBoundingClientRect().width + gap;
  };
  const fitsAll = () => {
    const all = tiles();
    if (!all.length) return true;
    return all.length * stepSize() <= viewport.clientWidth + 2;
  };
  const settle = (fn) => setTimeout(fn, DURATION);

  function next() {
    if (busy || fitsAll()) return;
    busy = true;
    track.style.transition = DURATION ? `transform ${DURATION}ms ease` : "none";
    track.style.transform = `translateX(${-stepSize()}px)`;
    settle(() => {
      track.style.transition = "none";
      track.appendChild(track.firstElementChild);
      track.style.transform = "translateX(0)";
      void track.offsetWidth;
      busy = false;
    });
  }

  function prev() {
    if (busy || fitsAll()) return;
    busy = true;
    track.style.transition = "none";
    track.insertBefore(track.lastElementChild, track.firstElementChild);
    track.style.transform = `translateX(${-stepSize()}px)`;
    void track.offsetWidth;
    track.style.transition = DURATION ? `transform ${DURATION}ms ease` : "none";
    track.style.transform = "translateX(0)";
    settle(() => {
      busy = false;
    });
  }

  function stop() {
    clearInterval(timer);
    timer = null;
  }
  function start() {
    stop();
    if (reduceMotion || paused || !visible || document.hidden) return;
    timer = setInterval(next, INTERVAL);
  }
  const restart = () => start();

  prevBtn && prevBtn.addEventListener("click", () => { prev(); restart(); });
  nextBtn && nextBtn.addEventListener("click", () => { next(); restart(); });

  // Pausa mientras el mouse, el dedo o el foco del teclado están sobre el carrusel.
  root.addEventListener("mouseenter", () => { paused = true; stop(); });
  root.addEventListener("mouseleave", () => { paused = false; start(); });
  root.addEventListener("focusin", () => { paused = true; stop(); });
  root.addEventListener("focusout", (e) => {
    if (!root.contains(e.relatedTarget)) { paused = false; start(); }
  });

  // Deslizar con el dedo (celular). Un deslizamiento no cuenta como clic en la categoría.
  let startX = null;
  let startY = null;
  let swiped = false;
  viewport.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    swiped = false;
    paused = true;
    stop();
  }, { passive: true });
  viewport.addEventListener("touchend", (e) => {
    if (startX === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      swiped = true;
      dx < 0 ? next() : prev();
    }
    startX = null;
    paused = false;
    setTimeout(start, 2500); // después de tocar, espera un poco antes de seguir solo
  }, { passive: true });
  viewport.addEventListener("click", (e) => {
    if (swiped) {
      e.preventDefault();
      e.stopPropagation();
      swiped = false;
    }
  }, true);

  // Solo se mueve cuando se ve (ahorra batería y no distrae fuera de pantalla).
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      visible = entries.some((en) => en.isIntersecting);
      visible ? start() : stop();
    }, { threshold: 0.2 }).observe(root);
  }
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  start();
})();
