/* Visor 360° para fichas de polo: secuencia de imagenes que se gira con una rueda dentada bajo la foto o arrastrando el polo. Sin librerias.
 * Se carga SOLO cuando el visitante pulsa «Ver en 360°» (la tienda no pide nada de esto al abrir).
 * Uso:  const v = Visor360.abrir(contenedor, "ruta/manifest.json");  ...  v.cerrar();
 * Una sola instancia activa; cuadros decodificados acotados a una ventana alrededor del actual.
 * La rueda es como la perilla de una rejilla de aire: se ve de canto, tiene muescas y gira sin fin hacia los dos lados.
 * Nada se dibuja encima del polo salvo los avisos de carga: la rueda y sus atajos van debajo.
 */
(function () {
  "use strict";
  var activo = null;
  var VENTANA = 3;        // cuadros a cada lado que se mantienen (7 cuadros ~ 18 MB decodificados a 720x900)
  var PX_RUEDA = 14;      // pixeles de rueda por cuadro
  var PASO_MUESCA = 5;    // grados entre muescas de la rueda (finas y juntas)

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt) e.textContent = txt;
    return e;
  }
  function nombreDe(az) { return az === 0 ? "Frente" : az === 180 ? "Espalda" : az + "°"; }

  function abrir(contenedor, urlManifest) {
    if (activo) activo.cerrar();
    // cont: cuadro SIN dar la vuelta (puede crecer o bajar sin limite); idx = cont modulo n. residuo: avance fino de la rueda entre dos cuadros.
    var estado = { cont: 0, idx: 0, n: 0, mitad: 0, base: "", archivos: [], azimutes: [], cache: new Map(), muerto: false, arrastre: null, residuo: 0 };
    var ctl = new AbortController();
    contenedor.classList.add("v360");
    contenedor.setAttribute("role", "group");
    contenedor.setAttribute("aria-label", "Vista 360 del polo");
    var lienzo = el("div", "v360-lienzo");
    lienzo.style.aspectRatio = "4 / 5"; // reserva el espacio de la foto: sin saltos al cargar
    var img = el("img", "v360-img");
    img.alt = "Polo visto desde distintos angulos";
    img.draggable = false;
    img.decoding = "async";
    var aviso = el("p", "v360-aviso");
    aviso.setAttribute("aria-live", "polite");
    lienzo.append(img, aviso);
    var control = el("div", "v360-control");
    var rueda = el("div", "v360-rueda");
    rueda.tabIndex = 0;
    rueda.setAttribute("role", "slider");
    rueda.setAttribute("aria-label", "Rueda para girar el polo");
    rueda.setAttribute("aria-orientation", "horizontal");
    rueda.setAttribute("aria-valuemin", "0");
    var lona = el("canvas", "v360-rueda-lona");
    lona.setAttribute("aria-hidden", "true");
    rueda.append(lona);
    var mFrente = el("button", "v360-marca", "Frente"), mEspalda = el("button", "v360-marca", "Espalda");
    mFrente.type = mEspalda.type = "button";
    control.append(mFrente, rueda, mEspalda);
    contenedor.append(lienzo, control);

    function norm(i) { return ((i % estado.n) + estado.n) % estado.n; }
    function url(i) { return estado.base + estado.archivos[norm(i)]; }

    function cargar(i) {
      i = norm(i);
      if (estado.cache.has(i)) return estado.cache.get(i);
      var im = new Image();
      im.decoding = "async";
      var p = new Promise(function (ok, mal) { im.onload = function () { ok(im); }; im.onerror = function () { mal(new Error("cuadro " + i)); }; });
      p.catch(function () {});           // evita «promesa rechazada sin atender» cuando se libera un cuadro
      im.src = url(i);
      im.__p = p;
      estado.cache.set(i, im);
      return im;
    }
    function liberar(im) { im.onload = im.onerror = null; im.removeAttribute("src"); }
    function podar() {
      estado.cache.forEach(function (im, i) {
        var d = Math.min(Math.abs(i - estado.idx), estado.n - Math.abs(i - estado.idx));
        if (d > VENTANA) { liberar(im); estado.cache.delete(i); }
      });
    }
    function precargar() {
      for (var k = 1; k <= VENTANA; k++) { cargar(estado.idx + k); cargar(estado.idx - k); }
      podar();
    }

    // Rueda vista de canto, fina y en tono hueso (como la corona de un reloj): las muescas se juntan hacia los bordes, como en un cilindro.
    // Mover a la derecha = el polo gira a la derecha.
    function pintarRueda() {
      var w = lona.clientWidth, h = lona.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (!w || !h) return;
      if (lona.width !== Math.round(w * dpr) || lona.height !== Math.round(h * dpr)) { lona.width = Math.round(w * dpr); lona.height = Math.round(h * dpr); }
      var c = lona.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      var g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, "#a39b8c"); g.addColorStop(0.2, "#cbc4b6"); g.addColorStop(0.5, "#e8e2d5"); g.addColorStop(0.8, "#cbc4b6"); g.addColorStop(1, "#a39b8c");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      var R = w / 2, giro = ((-estado.cont * PX_RUEDA + estado.residuo) / R) * 180 / Math.PI;
      var t0 = ((giro % PASO_MUESCA) + PASO_MUESCA) % PASO_MUESCA - 90, y0 = h * 0.2, alto = h * 0.6;
      for (var t = t0; t < 90; t += PASO_MUESCA) {
        var k = Math.cos(t * Math.PI / 180), x = R + R * Math.sin(t * Math.PI / 180), ancho = Math.max(0.5, 1.3 * k);
        c.fillStyle = "rgba(74,66,54," + (0.42 * k + 0.06).toFixed(2) + ")";
        c.fillRect(x - ancho / 2, y0, ancho, alto);                        // la muesca
        c.fillStyle = "rgba(255,255,255," + (0.6 * k).toFixed(2) + ")";
        c.fillRect(x + ancho / 2, y0, Math.max(0.5, ancho * 0.7), alto);   // su filo de luz
      }
      var s = c.createLinearGradient(0, 0, 0, h);
      s.addColorStop(0, "rgba(255,255,255,.5)"); s.addColorStop(0.3, "rgba(255,255,255,0)"); s.addColorStop(0.7, "rgba(60,52,40,0)"); s.addColorStop(1, "rgba(60,52,40,.22)");
      c.fillStyle = s;
      c.fillRect(0, 0, w, h);
    }
    // Al abrir, la rueda hace un leve vaiven para invitar a girarla (se omite si el visitante pidio menos movimiento).
    function invitar() {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      var ini = performance.now();
      (function paso(ahora) {
        var p = (ahora - ini) / 900;
        if (estado.muerto || estado.arrastre) return;
        estado.residuo = p >= 1 ? 0 : 9 * Math.sin(p * Math.PI * 2) * (1 - p);
        pintarRueda();
        if (p < 1) requestAnimationFrame(paso);
      })(ini);
    }

    function girar(cont, residuo) {
      if (estado.muerto || !estado.n) return;
      estado.cont = cont;
      estado.residuo = residuo || 0;
      var i = norm(cont), im = cargar(i);
      var listo = function () {
        if (estado.muerto || i !== estado.idx) return;
        img.src = im.src;
        aviso.textContent = "";
      };
      estado.idx = i;
      rueda.setAttribute("aria-valuenow", String(estado.azimutes[i]));
      rueda.setAttribute("aria-valuetext", nombreDe(estado.azimutes[i]));
      pintarRueda();
      if (im.complete && im.naturalWidth) listo(); else im.__p.then(listo).catch(function () { fallo("No se pudo cargar una imagen."); });
      precargar();
    }

    function fallo(msg) {
      aviso.textContent = msg + " ";
      var r = el("button", "v360-btn", "Reintentar");
      r.type = "button";
      r.onclick = function () { aviso.textContent = ""; estado.cache.clear(); girar(estado.cont); };
      aviso.append(r);
    }

    // Lleva el polo a un azimut por el camino mas corto.
    function irA(az) {
      var mejor = 0, dm = 1e9;
      estado.azimutes.forEach(function (a, k) { var d = Math.abs(((a - az + 540) % 360) - 180); if (d < dm) { dm = d; mejor = k; } });
      var salto = norm(mejor - estado.idx);
      if (salto > estado.mitad) salto -= estado.n;
      girar(estado.cont + salto);
    }
    function pxPorCuadro() { return Math.max(lienzo.clientWidth / estado.n * 1.1, 6); }

    function alBajar(e) {
      if (e.button && e.button !== 0) return;
      if (e.target.closest && e.target.closest("button")) return;   // los botones no inician arrastre: capturar el puntero les quitaba el clic
      var enRueda = e.currentTarget === rueda;
      estado.arrastre = { x: e.clientX, cont: estado.cont, rueda: enRueda };
      e.currentTarget.setPointerCapture(e.pointerId);
      (enRueda ? rueda : lienzo).classList.add("v360-arrastrando");
    }
    function alMover(e) {
      var a = estado.arrastre;
      if (!a) return;
      var dx = e.clientX - a.x, paso = a.rueda ? PX_RUEDA : pxPorCuadro(), pasos = Math.round(dx / paso);
      var cont = a.cont - pasos, residuo = a.rueda ? dx - pasos * PX_RUEDA : 0;
      if (cont !== estado.cont) girar(cont, residuo);
      else if (a.rueda) { estado.residuo = residuo; pintarRueda(); }
    }
    function alSoltar() {
      estado.arrastre = null;
      lienzo.classList.remove("v360-arrastrando");
      rueda.classList.remove("v360-arrastrando");
      if (estado.residuo) { estado.residuo = 0; pintarRueda(); }
    }
    function alTecla(e) {
      if (e.key === "ArrowRight" || e.key === "ArrowUp") girar(estado.cont - 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") girar(estado.cont + 1);
      else if (e.key === "Home") irA(0);
      else if (e.key === "End") irA(180);
      else return;
      e.preventDefault();
    }
    [lienzo, rueda].forEach(function (z) {
      z.addEventListener("pointerdown", alBajar);
      z.addEventListener("pointermove", alMover);
      z.addEventListener("pointerup", alSoltar);
      z.addEventListener("pointercancel", alSoltar);
    });
    rueda.addEventListener("keydown", alTecla);
    window.addEventListener("resize", pintarRueda);
    mFrente.onclick = function () { irA(0); };
    mEspalda.onclick = function () { irA(180); };

    var raiz = urlManifest.replace(/[^\/]*$/, "");
    aviso.textContent = "Cargando vista 360…";
    pintarRueda();
    fetch(urlManifest, { signal: ctl.signal })
      .then(function (r) { if (!r.ok) throw new Error("manifest " + r.status); return r.json(); })
      .then(function (m) {
        if (estado.muerto) return;
        estado.base = raiz;
        estado.archivos = m.cuadros.archivos;
        estado.azimutes = m.cuadros.azimutes_grados;
        estado.n = estado.archivos.length;
        estado.mitad = Math.floor(estado.n / 2);
        rueda.setAttribute("aria-valuemax", String(Math.max.apply(null, estado.azimutes)));
        img.src = raiz + m.poster;          // el poster se ve de inmediato, mientras llega el primer cuadro
        lienzo.style.aspectRatio = m.cuadros.ancho + " / " + m.cuadros.alto;
        aviso.textContent = "";
        girar(m.cuadros.inicio_indice || 0);
        invitar();
      })
      .catch(function (e) { if (!estado.muerto && e.name !== "AbortError") fallo("No se pudo cargar la vista 360."); });

    var api = {
      cerrar: function () {
        estado.muerto = true;
        ctl.abort();
        estado.cache.forEach(liberar);
        estado.cache.clear();
        window.removeEventListener("resize", pintarRueda);
        contenedor.textContent = "";        // al quitar lienzo y rueda del documento se van sus escuchas
        contenedor.classList.remove("v360");
        contenedor.removeAttribute("role");
        contenedor.removeAttribute("aria-label");
        if (activo === api) activo = null;
      },
      estado: function () { return { cuadro: estado.idx, azimut: estado.azimutes[estado.idx], cuadros_en_memoria: estado.cache.size, total: estado.n, vueltas: estado.cont }; }
    };
    activo = api;
    return api;
  }

  window.Visor360 = { abrir: abrir };
})();
