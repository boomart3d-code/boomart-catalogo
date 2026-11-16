/*
 * Utilidades PURAS del portal de Marcos (sin acceso al DOM ni a la red), para poder probarlas con Node:
 *   node vitrina-web/portal/util.test.js
 * Todo lo que importa (permisos, limites, estados) lo vuelve a validar el servidor; aqui solo se evita enviar basura
 * y se explican los errores con palabras de todos los dias.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VitrinaUtil = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MAX_FOTOS = 4;
  const MAX_BYTES_SERVIDOR = 307200;      // limite del bucket (300 KB)
  const OBJETIVO_PRINCIPAL = 280 * 1024;  // lo que intentamos lograr en el navegador
  const OBJETIVO_MINIATURA = 100 * 1024;
  const LADO_PRINCIPAL = 900;
  const LADO_MINIATURA = 360;
  const PRECIO_MAXIMO = 99999.99;
  const CANTIDAD_MAXIMA = 100000;

  // ---------------------------------------------------------------- textos
  function capitalizar(texto) {
    const limpio = String(texto || "").trim();
    if (!limpio) return "";
    const frase = limpio.charAt(0).toUpperCase() + limpio.slice(1);
    return /[.!?…]$/.test(frase) ? frase : `${frase}.`;
  }

  /** Quita el prefijo tecnico del servidor: «E_VALIDATION: agrega una foto» -> «Agrega una foto.» */
  function limpiarMensaje(mensaje) {
    const texto = String(mensaje || "").trim();
    const coincide = /^E_[A-Z_]+:\s*([\s\S]+)$/.exec(texto);
    return capitalizar(coincide ? coincide[1] : texto);
  }

  function esFalloDeRed(texto, estadoCrudo, codigo) {
    if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|econnrefused|timed? ?out|timeout|aborted|offline/i.test(texto)) return true;
    return estadoCrudo === 0 && texto === "" && !codigo;     // la libreria responde estado 0 y sin mensaje cuando no hubo respuesta
  }

  const GENERICO = "Algo salió mal. Intenta de nuevo en un momento.";

  /**
   * Traduce cualquier error (Postgres/PostgREST, Storage, Auth, red) a una frase para una persona.
   * `contexto.duplicado` permite explicar un nombre repetido segun lo que se estaba guardando.
   */
  function mensajeAmable(err, contexto) {
    const ctx = contexto || {};
    if (!err) return GENERICO;
    const crudo = typeof err === "string" ? err : String(err.message || err.error_description || err.msg || "");
    const codigo = String(err.code || "");
    const estado = Number(err.status || err.statusCode || 0) || 0;
    const e = /^E_([A-Z_]+):\s*([\s\S]+)$/.exec(crudo.trim());
    if (e) {
      if (e[1] === "VALIDATION") return capitalizar(e[2]);
      if (e[1] === "FORBIDDEN") return "Eso solo lo puede hacer BoomArt.";
      return capitalizar(e[2]);
    }
    if (esFalloDeRed(crudo, err.status, codigo)) return "No hay internet en este momento. No se perdió nada: cuando vuelva la señal, intenta de nuevo.";
    if (codigo === "23505") return ctx.duplicado || "Ya existe uno con ese nombre. Usa otro nombre.";
    if (codigo === "23503") return "Esa sección o colección ya no existe. Vuelve a elegirla.";
    if (codigo === "23514") return "Algún dato no es válido. Revisa el nombre, el precio y la cantidad.";
    if (codigo === "PGRST301" || estado === 401 || /jwt|invalid refresh token|not authenticated|session/i.test(crudo)) return "Tu sesión venció. Entra de nuevo; lo que escribiste se guardó en el celular.";
    if (codigo === "42501" || estado === 403 || /row-level security|permission denied|not allowed|violates row/i.test(crudo)) return "No tienes permiso para hacer eso. Avisa a BoomArt.";
    if (estado === 413 || /exceeded the maximum|payload too large|too large/i.test(crudo)) return "La foto pesa demasiado. Prueba con otra.";
    if (estado === 415 || /mime type|not supported|unsupported/i.test(crudo)) return "Ese archivo no sirve. Elige una foto.";
    if (estado === 429 || /too many|rate limit/i.test(crudo)) return "Demasiados intentos seguidos. Espera un minuto e intenta de nuevo.";
    if (estado >= 500) return "Hubo un problema de nuestro lado. Intenta de nuevo en un momento.";
    return GENERICO;
  }

  /** Errores al entrar: nunca se dice si fallo el usuario o la clave. */
  function mensajeEntrar(err) {
    const crudo = String((err && (err.message || err.msg)) || "");
    const estado = Number((err && (err.status || err.statusCode)) || 0) || 0;
    if (esFalloDeRed(crudo, err && err.status, "") || estado >= 500) return "No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.";
    if (estado === 429 || /too many|rate limit/i.test(crudo)) return "Demasiados intentos. Espera un minuto e intenta de nuevo.";
    return "Usuario o clave incorrectos. Revisa que estén bien escritos.";
  }

  function plural(n, uno, varios) {
    return n === 1 ? uno : varios;
  }

  // ---------------------------------------------------------------- dinero y numeros
  /** "25", "25.5", "25,50", " S/ 25.50 " -> "25.50"; null si no es un precio valido (mayor que 0 y menor que 100000). */
  function parsePrecio(texto) {
    if (typeof texto !== "string") return null;
    const limpio = texto.trim().replace(/^s\/\.?\s*/i, "").trim().replace(",", ".");
    if (!/^[0-9]{1,5}(\.[0-9]{1,2})?$/.test(limpio)) return null;
    const valor = Number(limpio);
    if (!(valor > 0 && valor <= PRECIO_MAXIMO)) return null;
    const [entero, centavos = ""] = limpio.split(".");
    return `${Number(entero)}.${centavos.padEnd(2, "0")}`;
  }

  function formatoSoles(valor) {
    const numero = Number(valor);
    if (valor === null || valor === undefined || valor === "" || !Number.isFinite(numero)) return "S/ 0.00";
    const [entero, centavos] = Math.abs(numero).toFixed(2).split(".");
    return `${numero < 0 ? "-" : ""}S/ ${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${centavos}`;
  }

  /** "3" -> 3; null si no es un entero entre min y max. */
  function parseEntero(texto, min, max) {
    const tope = max === undefined ? CANTIDAD_MAXIMA : max;
    const piso = min === undefined ? 0 : min;
    if (typeof texto === "number") texto = String(texto);
    if (typeof texto !== "string" || !/^[0-9]{1,6}$/.test(texto.trim())) return null;
    const valor = Number(texto.trim());
    return valor >= piso && valor <= tope ? valor : null;
  }

  /** WhatsApp: solo digitos con codigo de pais (9 a 15). Quita espacios, +, guiones y parentesis. "" = sin numero. */
  function parseWhatsapp(texto) {
    const limpio = String(texto || "").replace(/[\s+\-().]/g, "");
    if (limpio === "") return { ok: true, valor: null };
    return /^[0-9]{9,15}$/.test(limpio) ? { ok: true, valor: limpio } : { ok: false, valor: null };
  }

  // ---------------------------------------------------------------- fotos
  /** Tamano final: el lado mayor no pasa de `maxLado` y nunca se agranda. */
  function tamanoImagen(ancho, alto, maxLado) {
    const w = Math.max(1, Math.round(ancho));
    const h = Math.max(1, Math.round(alto));
    const mayor = Math.max(w, h);
    if (mayor <= maxLado) return { ancho: w, alto: h };
    const factor = maxLado / mayor;
    return { ancho: Math.max(1, Math.round(w * factor)), alto: Math.max(1, Math.round(h * factor)) };
  }

  /** Intentos de compresion en orden: primero baja la calidad; si aun pesa mucho, reduce el lado. */
  function intentosCompresion(maxLado) {
    const lados = [1, 0.85, 0.72, 0.6, 0.5].map((f) => Math.round(maxLado * f));
    const calidades = [0.82, 0.72, 0.62, 0.5, 0.4];
    const lista = [];
    for (const lado of lados) for (const calidad of calidades) lista.push({ lado, calidad });
    return lista;
  }

  /** Segun lo que devolvio el navegador al codificar. null = no sirve (ej. devolvio png). */
  function formatoDeBlob(tipo) {
    if (tipo === "image/webp") return { mime: "image/webp", ext: "webp" };
    if (tipo === "image/jpeg") return { mime: "image/jpeg", ext: "jpg" };
    return null;
  }

  /** Rutas EXACTAS que exige la base: `${vendedor}/${producto}/${foto}.ext` y `${...}-t.ext`. */
  function rutasFoto(vendedorId, productoId, fotoId, ext) {
    const base = `${vendedorId}/${productoId}/${fotoId}`;
    return { path: `${base}.${ext}`, thumb_path: `${base}-t.${ext}` };
  }

  /** Mueve el elemento `indice` al principio (hacer principal). Devuelve una lista nueva. */
  function moverAlPrincipio(lista, indice) {
    if (!Array.isArray(lista) || indice <= 0 || indice >= lista.length) return Array.isArray(lista) ? lista.slice() : [];
    const copia = lista.slice();
    const [item] = copia.splice(indice, 1);
    copia.unshift(item);
    return copia;
  }

  /** De las fotos embebidas de un producto, la que va de portada (la de menor posicion). */
  function fotoPortada(fotos) {
    if (!Array.isArray(fotos) || !fotos.length) return null;
    return fotos.reduce((mejor, f) => (Number(f.position) < Number(mejor.position) ? f : mejor), fotos[0]);
  }

  // ---------------------------------------------------------------- nombres parecidos (evitar duplicados)
  function normalizarNombre(texto) {
    return String(texto || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function distancia(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const actual = [i];
      for (let j = 1; j <= b.length; j += 1) {
        actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      previa = actual;
    }
    return previa[b.length];
  }

  /** Sugiere nombres existentes que se parecen a lo que se escribe («harry poter» -> «Harry Potter»). */
  function nombresParecidos(texto, existentes, maximo) {
    const buscado = normalizarNombre(texto);
    if (buscado.length < 2) return [];
    const salida = [];
    for (const item of existentes || []) {
      const nombre = normalizarNombre(item.nombre);
      if (!nombre) continue;
      let puntos = null;
      if (nombre === buscado) puntos = 0;
      else if (buscado.length >= 3 && (nombre.includes(buscado) || buscado.includes(nombre))) puntos = 1;
      else if (distancia(nombre, buscado) <= (buscado.length <= 4 ? 1 : 2)) puntos = 2;
      else {
        const palabras = nombre.split(" ");
        const escritas = buscado.split(" ");
        if (palabras.length > 1 && escritas.length >= 1 && escritas.every((w) => w.length >= 3 && palabras.some((p) => distancia(p, w) <= 1))) puntos = 3;
      }
      if (puntos !== null) salida.push({ puntos, item });
    }
    salida.sort((x, y) => x.puntos - y.puntos || x.item.nombre.localeCompare(y.item.nombre, "es"));
    return salida.slice(0, maximo || 3).map((s) => s.item);
  }

  /** Para busquedas con ilike: que % y _ escritos por la persona no actuen como comodines. */
  function escaparLike(texto) {
    return String(texto || "").replace(/[\\%_]/g, (c) => `\\${c}`);
  }

  // ---------------------------------------------------------------- estados de un producto
  const FILTROS = [
    { clave: "todos", texto: "Todos" },
    { clave: "borrador", texto: "Sin enviar" },
    { clave: "en_validacion", texto: "Esperando a BoomArt" },
    { clave: "aprobado", texto: "Publicados" },
    { clave: "cambios_pedidos", texto: "BoomArt pide cambios" },
    { clave: "ocultos", texto: "Ocultos" },
  ];

  function coincideFiltro(p, clave) {
    switch (clave) {
      case "todos": return true;
      case "ocultos": return p.visible === false || p.admin_hidden === true;
      case "borrador":
      case "en_validacion":
      case "aprobado":
      case "cambios_pedidos": return p.review_state === clave;
      default: return true;
    }
  }

  /** Etiquetas en palabras claras (puede haber varias: el estado y si esta oculto). tono: gris|ambar|verde|rojo|azul|oscuro */
  function etiquetasProducto(p) {
    const etiquetas = [];
    switch (p.review_state) {
      case "borrador":
        etiquetas.push(p.published_at ? { texto: "Publicado, con cambios sin enviar", tono: "azul" } : { texto: "Sin enviar", tono: "gris" });
        break;
      case "en_validacion": etiquetas.push({ texto: "Esperando a BoomArt", tono: "ambar" }); break;
      case "cambios_pedidos": etiquetas.push({ texto: "BoomArt pide cambios", tono: "rojo" }); break;
      case "aprobado": etiquetas.push({ texto: "Publicado en la web", tono: "verde" }); break;
      default: etiquetas.push({ texto: "Sin enviar", tono: "gris" });
    }
    if (p.admin_hidden) etiquetas.push({ texto: "Oculto por BoomArt (consulta con Adrián)", tono: "oscuro" });
    if (p.visible === false) etiquetas.push({ texto: "Oculto por ti", tono: "oscuro" });
    return etiquetas;
  }

  /** ¿Se puede mandar a validar? Mismas reglas que el servidor, para avisar antes de que falle. */
  function listoParaEnviar(p, cantidadFotos) {
    const faltan = [];
    if (String(p.title || "").trim().length < 3) faltan.push("el nombre (al menos 3 letras)");
    if (p.price === null || p.price === undefined || p.price === "" || !(Number(p.price) > 0)) faltan.push("el precio");
    if (!(cantidadFotos >= 1)) faltan.push("al menos una foto");
    if (!p.section_id) faltan.push("la sección");
    return { ok: faltan.length === 0, faltan };
  }

  /** ¿Cambiar esto en un producto ya publicado pide revision de BoomArt? (nombre, descripcion, categoria, fotos) */
  function cambioPideRevision(antes, despues, fotosCambiaron) {
    return fotosCambiaron === true
      || String(antes.title || "") !== String(despues.title || "")
      || String(antes.description || "") !== String(despues.description || "")
      || (antes.section_id || null) !== (despues.section_id || null)
      || (antes.collection_id || null) !== (despues.collection_id || null);
  }

  // ---------------------------------------------------------------- acceso
  /** El usuario escribe su nombre; el correo tecnico lo arma el portal. null si no tiene forma valida. */
  function emailDeUsuario(entrada, dominio) {
    const usuario = String(entrada || "").trim().toLowerCase().split("@")[0];
    return /^[a-z0-9][a-z0-9._-]{2,39}$/.test(usuario) ? `${usuario}@${dominio}` : null;
  }

  function nuevoId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return {
    MAX_FOTOS, MAX_BYTES_SERVIDOR, OBJETIVO_PRINCIPAL, OBJETIVO_MINIATURA, LADO_PRINCIPAL, LADO_MINIATURA, PRECIO_MAXIMO, CANTIDAD_MAXIMA,
    FILTROS, capitalizar, limpiarMensaje, mensajeAmable, mensajeEntrar, plural,
    parsePrecio, formatoSoles, parseEntero, parseWhatsapp,
    tamanoImagen, intentosCompresion, formatoDeBlob, rutasFoto, moverAlPrincipio, fotoPortada,
    normalizarNombre, distancia, nombresParecidos, escaparLike,
    coincideFiltro, etiquetasProducto, listoParaEnviar, cambioPideRevision,
    emailDeUsuario, nuevoId,
  };
});
