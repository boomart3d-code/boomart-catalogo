/*
 * Portal de Marcos (vendedor de Random Figures) · «Vitrina Random Figures» de BoomArt.
 * Aqui vive lo comun: entrar/salir, la barra, el menu de abajo y el enrutador por «#/ruta». Cada pantalla esta en su archivo y se
 * registra en `VitrinaApp.pantallas`. Reglas: sin innerHTML con datos, sin codigo ni estilos en linea (CSP), todo texto con textContent.
 */
(function (root) {
  "use strict";
  const U = root.VitrinaUtil;
  const D = root.VitrinaDatos;
  const UI = root.VitrinaUI;
  const $ = (id) => document.getElementById(id);

  const RUTAS = [
    { re: /^\/inicio$/, pantalla: "inicio", nav: "inicio" },
    { re: /^\/publicar(?:\/([1-4]|listo))?$/, pantalla: "publicar", nav: "publicar", params: ["paso"] },
    { re: /^\/stock$/, pantalla: "stock", nav: "stock" },
    { re: /^\/productos$/, pantalla: "productos", nav: "productos" },
    { re: /^\/producto\/([0-9a-f-]{36})$/, pantalla: "editar", nav: "productos", params: ["id"] },
    { re: /^\/validar$/, pantalla: "validar", nav: "productos" },
    { re: /^\/categorias$/, pantalla: "categorias", nav: "mas" },
    { re: /^\/mas$/, pantalla: "mas", nav: "mas" },
    { re: /^\/mas\/tienda$/, pantalla: "tienda", nav: "mas" },
    { re: /^\/mas\/ayuda$/, pantalla: "ayuda", nav: "mas" },
    { re: /^\/mas\/instalar$/, pantalla: "instalar", nav: "mas" },
  ];

  const App = {
    tienda: null,
    pantallas: {},
    guardia: null,          // funcion que dice si hay cambios sin guardar en la pantalla actual
    _categorias: null,
  };

  let version = 0;          // para ignorar pantallas que terminan de cargar tarde
  let limpiarActual = null;
  let hashAnterior = "";
  let ignorarCambio = false;

  // ---------------------------------------------------------------- errores y sesion
  App.esErrorDeSesion = (err) => !!err && (err.status === 401 || err.code === "PGRST301" || /jwt expired|invalid jwt|not authenticated|refresh token/i.test(String(err.message || "")));

  /** Atiende un error: si la sesion vencio manda a «Entrar» (devuelve true); si no, avisa con palabras sencillas (devuelve false). */
  App.manejarError = (err, contexto) => {
    if (App.esErrorDeSesion(err)) { App.sesionVencida(); return true; }
    UI.avisar(U.mensajeAmable(err, contexto), "error");
    return false;
  };

  App.sesionVencida = () => {
    if (!App.tienda) return;
    App.limpiarSesion();
    mostrarEntrar("Tu sesión venció. Entra de nuevo; lo que escribiste quedó guardado en tu celular.");
  };

  App.limpiarSesion = () => {
    if (limpiarActual) { try { limpiarActual(); } catch { /* nada */ } limpiarActual = null; }
    version += 1;
    App.guardia = null;
    App.tienda = null;
    App._categorias = null;
    D.olvidarFirmadas();
    for (const nombre of Object.keys(App.pantallas)) if (App.pantallas[nombre].olvidar) App.pantallas[nombre].olvidar();
    $("contenido").replaceChildren();
  };

  // ---------------------------------------------------------------- categorias (se piden pocas veces y se guardan en memoria)
  App.cargarCategorias = async (forzar) => {
    if (forzar || !App._categorias) {
      const [secciones, colecciones] = await Promise.all([D.secciones(), D.colecciones()]);
      App._categorias = { secciones, colecciones };
    }
    return App._categorias;
  };
  App.invalidarCategorias = () => { App._categorias = null; };

  // ---------------------------------------------------------------- vistas
  function mostrarVista(cual) {
    document.body.classList.remove("esperando-senal");
    $("vista-entrar").hidden = cual !== "entrar";
    $("vista-app").hidden = cual !== "app";
  }

  // ---------------------------------------------------------------- clave guardada en el celular
  // La sesion abierta ya se guarda sola y se renueva; esto es un respaldo: si el navegador (Chrome en Android) guardo el usuario y la clave,
  // los ofrece y, si hace falta volver a entrar, entra sin que Marcos escriba nada. Si el navegador no lo permite, no pasa nada.
  const hayGestorDeClaves = () => !!(root.PasswordCredential && root.navigator.credentials && root.navigator.credentials.store && root.navigator.credentials.get);

  function guardarClaveEnNavegador(usuario, clave) {
    if (!hayGestorDeClaves()) return;
    try {
      root.navigator.credentials.store(new root.PasswordCredential({ id: usuario.trim(), password: clave, name: App.tienda ? App.tienda.name : "Mi vitrina" })).catch(() => {});
    } catch { /* nada */ }
  }

  /** Solo al abrir la aplicacion sin sesion: prueba con la clave que el navegador tenga guardada (sin preguntar). Devuelve true si entro. */
  async function entrarConClaveGuardada() {
    if (!hayGestorDeClaves() || root.navigator.onLine === false) return false;
    try {
      const guardada = await root.navigator.credentials.get({ password: true, mediation: "silent" });
      if (!guardada || !guardada.id || !guardada.password) return false;
      await D.entrar(guardada.id, guardada.password);
      await iniciarSesion();
      return true;
    } catch { return false; }
  }

  // Sin internet al abrir: la sesion guardada sigue valida, asi que NO se pide la clave; se espera la senal.
  let esperandoSenal = false;
  function esperarSenal() {
    mostrarVista("app");
    document.body.classList.add("esperando-senal");
    $("contenido").replaceChildren(UI.panelError("No hay internet por ahora. Tu sesión sigue abierta: en cuanto vuelva la señal, tu vitrina se abre sola.", () => arrancarSesion()));
    if (esperandoSenal) return;
    esperandoSenal = true;
    window.addEventListener("online", () => { esperandoSenal = false; if (!App.tienda) arrancarSesion(); }, { once: true });
  }

  function mostrarEntrar(mensaje) {
    mostrarVista("entrar");
    mostrarErrorEntrar(mensaje || "");
    document.title = "Mi vitrina · Random Figures";
    setTimeout(() => $("entrar-usuario").focus(), 50);
  }

  function mostrarErrorEntrar(mensaje) {
    const nodo = $("entrar-error");
    nodo.textContent = mensaje;
    nodo.hidden = !mensaje;
  }

  function ponerOjo(visible) {
    const campo = $("entrar-clave");
    const boton = $("entrar-ojo");
    campo.type = visible ? "text" : "password";
    boton.setAttribute("aria-pressed", visible ? "true" : "false");
    boton.setAttribute("aria-label", visible ? "Ocultar la clave" : "Mostrar la clave");
    boton.replaceChildren(UI.icono(visible ? "ojo_tachado" : "ojo", 26));
  }

  async function alEntrar(evento) {
    evento.preventDefault();
    mostrarErrorEntrar("");
    ponerOjo(false);
    const usuario = $("entrar-usuario").value;
    const clave = $("entrar-clave").value;
    if (!usuario.trim() || !clave) { mostrarErrorEntrar("Escribe tu usuario y tu clave."); return; }
    try {
      await UI.trabajando($("entrar-boton"), "Entrando…", async () => {
        await D.entrar(usuario, clave);
        await iniciarSesion();
      });
      guardarClaveEnNavegador(usuario, clave);
      $("entrar-clave").value = "";
    } catch (err) {
      mostrarErrorEntrar(err && err.amable ? err.amable : U.mensajeEntrar(err));
    }
  }

  /** Con la sesion abierta: trae su tienda y muestra la aplicacion. Si algo falla lanza { amable, cuenta? }. */
  async function iniciarSesion() {
    let resultado;
    try {
      resultado = await D.cargarTienda();
    } catch (err) {
      if (App.esErrorDeSesion(err)) { await D.salir(); throw { amable: "Tu sesión venció. Entra de nuevo.", cuenta: true }; }
      throw { amable: U.mensajeAmable(err) };
    }
    if (resultado.problema) {
      await D.salir();
      throw { amable: resultado.problema, cuenta: true };
    }
    App.tienda = resultado.tienda;
    if (root.VitrinaPWA) root.VitrinaPWA.pedirAlmacenamientoFirme();     // que el celular no borre la sesion guardada
    prepararBarra();
    mostrarVista("app");
    if (!location.hash || location.hash === "#" || location.hash === "#/") history.replaceState(null, "", "#/inicio");
    await mostrarRuta();
  }

  const ESPERA_SESION_MS = 8000;      // sin senal, la libreria reintenta muchas veces: pasado este tiempo se avisa en vez de dejar la pantalla en blanco

  async function arrancarSesion() {
    // Si el celular ya tiene una sesion guardada se muestra «Abriendo…» al instante (no la pantalla de entrar ni una pantalla en blanco).
    if (D.tieneSesionGuardada()) {
      mostrarVista("app");
      $("contenido").replaceChildren(UI.cargando("Abriendo tu vitrina…"));
    }
    let sesion = null;
    let seCansoDeEsperar = false;
    const pedido = D.sesion();
    // Si la red tardo demasiado (se mostro el aviso) y luego responde, se abre sola; si no, quedaria esperando a que Marcos toque «Reintentar».
    // Solo lo hace la llamada que se canso de esperar y solo una vez: asi no se encadenan arranques.
    pedido.then(() => { if (seCansoDeEsperar && document.body.classList.contains("esperando-senal")) arrancarSesion(); }, () => { /* el error se atiende abajo */ });
    try {
      sesion = await Promise.race([pedido, new Promise((_, rechazar) => setTimeout(() => rechazar({ code: "sin_red", espera: true }), ESPERA_SESION_MS))]);
    } catch (err) {
      if (err && err.code === "sin_red") { seCansoDeEsperar = !!err.espera; esperarSenal(); return; }
      sesion = null;
    }
    if (!sesion) {
      if (await entrarConClaveGuardada()) return;
      mostrarEntrar("");
      return;
    }
    mostrarVista("app");
    $("contenido").replaceChildren(UI.cargando("Abriendo tu vitrina…"));
    try {
      await iniciarSesion();
    } catch (err) {
      if (err && err.cuenta) { mostrarEntrar(err.amable); return; }
      mostrarVista("app");
      $("contenido").replaceChildren(UI.panelError(err && err.amable ? err.amable : U.mensajeAmable(err), () => arrancarSesion()));
    }
  }

  async function salir() {
    const seguro = await UI.confirmar({ titulo: "¿Salir de tu vitrina?", texto: "Para volver a entrar necesitarás tu usuario y tu clave.", si: "Sí, salir", no: "No, quedarme" });
    if (!seguro) return;
    App.guardia = null;
    await D.salir();
    // «Salir» es salir de verdad: el navegador no debe volver a entrar solo con la clave guardada.
    try { if (root.navigator.credentials && root.navigator.credentials.preventSilentAccess) await root.navigator.credentials.preventSilentAccess(); } catch { /* nada */ }
    App.limpiarSesion();
    history.replaceState(null, "", location.pathname + location.search);
    $("entrar-usuario").value = "";
    $("entrar-clave").value = "";
    mostrarEntrar("");
  }
  App.salir = salir;

  // ---------------------------------------------------------------- barra superior y menu de abajo
  function prepararBarra() {
    for (const lugar of document.querySelectorAll("[data-icono]")) {
      if (!lugar.firstChild) lugar.append(UI.icono(lugar.dataset.icono, 30));
    }
  }

  /** `atras`: direccion («#/...») a la que vuelve el boton «Atrás»; null = pantalla principal (se ve el logo). */
  App.barra = ({ titulo, atras }) => {
    const boton = $("barra-atras");
    $("barra-titulo").textContent = titulo || (App.tienda ? App.tienda.name : "Mi vitrina");
    $("barra-sub").textContent = atras ? "" : "Mi vitrina · BoomArt";
    $("barra-logo").hidden = !!atras;
    boton.hidden = !atras;
    boton.onclick = atras ? () => App.ir(atras) : null;
    if (atras) boton.replaceChildren(UI.icono("atras", 26), "Atrás");
  };

  function marcarMenu(clave) {
    for (const enlace of document.querySelectorAll(".nav__boton")) {
      const activo = enlace.dataset.nav === clave;
      enlace.classList.toggle("es-activo", activo);
      if (activo) enlace.setAttribute("aria-current", "page"); else enlace.removeAttribute("aria-current");
    }
  }

  // ---------------------------------------------------------------- enrutador
  App.ir = (hash, opciones) => {
    if (opciones && opciones.reemplazar) { history.replaceState(null, "", hash); mostrarRuta(); return; }
    if (location.hash === hash) { mostrarRuta(); return; }
    location.hash = hash;
  };

  function leerHash() {
    const crudo = (location.hash || "#/inicio").replace(/^#/, "");
    const [ruta, consulta = ""] = crudo.split("?");
    const consultaParams = {};
    for (const par of consulta.split("&")) {
      if (!par) continue;
      const [k, v = ""] = par.split("=");
      try { consultaParams[decodeURIComponent(k)] = decodeURIComponent(v); } catch { /* parametro mal escrito: se ignora */ }
    }
    return { ruta: ruta || "/inicio", consulta: consultaParams };
  }

  async function alCambiarHash() {
    if (ignorarCambio) { ignorarCambio = false; return; }
    if (!App.tienda) return;
    if (App.guardia && App.guardia()) {
      const destino = location.hash;
      const salir = await UI.confirmar({
        titulo: "Tienes cambios sin guardar", texto: "Si sales ahora, se pierden los cambios que hiciste en esta pantalla.",
        si: "Salir sin guardar", no: "Quedarme aquí", peligro: true,
      });
      if (!salir) { ignorarCambio = true; location.hash = hashAnterior; return; }
      App.guardia = null;
      if (location.hash !== destino) { ignorarCambio = true; location.hash = destino; }
    }
    await mostrarRuta();
  }

  async function mostrarRuta() {
    if (!App.tienda) return;
    const { ruta, consulta } = leerHash();
    const def = RUTAS.map((r) => ({ r, m: r.re.exec(ruta) })).find((x) => x.m);
    if (!def) { history.replaceState(null, "", "#/inicio"); return mostrarRuta(); }
    hashAnterior = location.hash || "#/inicio";
    const params = { ...consulta };
    (def.r.params || []).forEach((nombre, i) => { params[nombre] = def.m[i + 1]; });
    const mia = ++version;
    const vive = () => mia === version && !!App.tienda;
    if (limpiarActual) { try { limpiarActual(); } catch { /* nada */ } limpiarActual = null; }
    App.guardia = null;
    marcarMenu(def.r.nav);
    const raiz = $("contenido");
    raiz.className = "contenido";
    const espera = UI.cargando();
    const raizPantalla = document.createElement("div");
    raizPantalla.className = "pantalla";
    raizPantalla.hidden = true;
    raiz.replaceChildren(espera, raizPantalla);
    App.barra({ titulo: null, atras: null });
    try {
      const resultado = await App.pantallas[def.r.pantalla].montar(raizPantalla, params, vive);
      if (!vive()) { if (resultado && resultado.limpiar) resultado.limpiar(); return; }
      espera.remove();
      raizPantalla.hidden = false;
      limpiarActual = resultado && resultado.limpiar ? resultado.limpiar : null;
      window.scrollTo(0, 0);
      raiz.focus({ preventScroll: true });
      const titulo = raizPantalla.querySelector("h1");
      document.title = `${titulo ? titulo.textContent : "Mi vitrina"} · Random Figures`;
    } catch (err) {
      if (!vive()) return;
      if (App.esErrorDeSesion(err)) { App.sesionVencida(); return; }
      raiz.replaceChildren(UI.panelError(U.mensajeAmable(err), () => mostrarRuta()));
    }
  }
  App.recargarPantalla = () => mostrarRuta();

  // ---------------------------------------------------------------- avisos de conexion y salida
  function conectar() {
    $("form-entrar").addEventListener("submit", alEntrar);
    $("entrar-ojo").addEventListener("click", () => ponerOjo($("entrar-clave").type === "password"));
    ponerOjo(false);
    window.addEventListener("hashchange", alCambiarHash);
    window.addEventListener("online", () => { $("aviso-red").hidden = true; });
    window.addEventListener("offline", () => { $("aviso-red").hidden = false; });
    if (navigator.onLine === false) $("aviso-red").hidden = false;
    // En el celular, mientras se escribe se esconde el menu de abajo para que el teclado no deje la pantalla sin espacio.
    document.addEventListener("focusin", (e) => { if (e.target.matches && e.target.matches("input:not([type=checkbox]):not([type=file]), textarea")) document.body.classList.add("con-teclado"); });
    document.addEventListener("focusout", () => setTimeout(() => {
      const a = document.activeElement;
      if (!(a && a.matches && a.matches("input:not([type=checkbox]):not([type=file]), textarea"))) document.body.classList.remove("con-teclado");
    }, 120));
    window.addEventListener("beforeunload", (e) => { if (App.guardia && App.guardia()) { e.preventDefault(); e.returnValue = ""; } });
    // Si el servidor cierra la sesion (por ejemplo, la clave se restablecio), se vuelve a «Entrar» sin tecnicismos.
    D.sb.auth.onAuthStateChange((evento) => { if (evento === "SIGNED_OUT" && App.tienda) App.sesionVencida(); });
  }

  App.arrancar = () => {
    conectar();
    arrancarSesion();
  };

  root.VitrinaApp = App;
})(window);
