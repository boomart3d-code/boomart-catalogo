/*
 * Instalacion en el celular («Agregar a la pantalla de inicio»). Se carga ANTES que las pantallas porque el navegador avisa
 * (`beforeinstallprompt`) una sola vez y temprano. Aqui no hay datos de la tienda ni claves.
 *  - Registra el service worker (solo con https o localhost) para que la aplicacion instalada abra aunque la senal sea mala.
 *  - Guarda el aviso de instalacion para mostrar un boton «Instalar» propio.
 *  - Pide al navegador que NO borre el almacenamiento (ahi vive la sesion abierta y lo que Marcos va escribiendo).
 */
(function (root) {
  "use strict";
  const CLAVE_POSPUESTO = "vitrina-instalar-pospuesto";
  const DIAS_POSPUESTO = 14;
  let aviso = null;           // evento `beforeinstallprompt` guardado
  let instalada = false;
  const oyentes = new Set();

  const modoApp = () => {
    try {
      return !!((root.matchMedia && root.matchMedia("(display-mode: standalone)").matches) || root.navigator.standalone === true);
    } catch { return false; }
  };
  const avisarCambio = () => { for (const oyente of oyentes) { try { oyente(); } catch { /* nada */ } } };

  root.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();          // se muestra mas tarde, con nuestro propio boton
    aviso = evento;
    avisarCambio();
  });
  root.addEventListener("appinstalled", () => {
    instalada = true;
    aviso = null;
    avisarCambio();
  });

  if ("serviceWorker" in root.navigator && (root.isSecureContext || root.location.hostname === "localhost")) {
    root.addEventListener("load", () => {
      root.navigator.serviceWorker.register("sw.js").catch(() => { /* sin service worker la pagina funciona igual, solo sin copia para cuando no hay senal */ });
    });
  }

  function pedirAlmacenamientoFirme() {
    try { if (root.navigator.storage && root.navigator.storage.persist) root.navigator.storage.persist().catch(() => {}); } catch { /* nada */ }
  }

  function leerPospuesto() {
    try { return Number(root.localStorage.getItem(CLAVE_POSPUESTO)) || 0; } catch { return 0; }
  }

  root.VitrinaPWA = {
    /** Ya esta abierta como aplicacion instalada (sin barra del navegador). */
    estaInstalada: () => instalada || modoApp(),
    /** El navegador ofrece instalar con un toque (Chrome en Android). */
    puedeInstalarYa: () => !!aviso && !instalada && !modoApp(),
    /** Pide al navegador instalar. Devuelve «aceptada», «rechazada» o «no_disponible». */
    async instalar() {
      if (!aviso) return "no_disponible";
      const pedido = aviso;
      aviso = null;
      try {
        await pedido.prompt();
        const { outcome } = await pedido.userChoice;
        avisarCambio();
        return outcome === "accepted" ? "aceptada" : "rechazada";
      } catch {
        avisarCambio();
        return "no_disponible";
      }
    },
    /** Para no insistir: el aviso de Inicio se oculta 14 dias despues de tocar «Ahora no». */
    pospuesto: () => (Date.now() - leerPospuesto()) < DIAS_POSPUESTO * 86400000,
    posponer() { try { root.localStorage.setItem(CLAVE_POSPUESTO, String(Date.now())); } catch { /* nada */ } },
    /** Para que una pantalla se repinte cuando el navegador avisa tarde o termina la instalacion. */
    alCambiar(oyente) { oyentes.add(oyente); return () => oyentes.delete(oyente); },
    pedirAlmacenamientoFirme,
    esAndroid: () => /android/i.test(root.navigator.userAgent || ""),
    esIphone: () => /iphone|ipad|ipod/i.test(root.navigator.userAgent || ""),
  };
})(window);
