/*
 * Acceso a los datos de Marcos: TODO va con su propia sesion (JWT) y las reglas de seguridad (RLS) de la base lo aislan.
 * Aqui no hay logica de pantalla: cada funcion hace una cosa y, si falla, lanza un objeto { message, code, status } que
 * `VitrinaUtil.mensajeAmable` convierte en una frase para una persona.
 */
(function (root) {
  "use strict";
  const CFG = root.VITRINA_CONFIG;
  const U = root.VitrinaUtil;
  const BUCKET = "vitrina-borradores";
  const CAMPOS_LISTA = "id, code, title, price, qty, show_qty, visible, admin_hidden, review_state, review_note, published_at, section_id, collection_id, created_at, product_photos(position, thumb_path)";

  const sb = root.supabase.createClient(CFG.apiUrl, CFG.publishableKey, {
    db: { schema: "vitrina" },
    // storageKey propio: asi la sesion de Marcos no se mezcla con la del panel de BoomArt (/admin/) si se prueban en el mismo navegador
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "vitrina-marcos-auth" },
    // Ningun pedido espera para siempre: si la señal se queda colgada, a los 25 s (45 s con foto) se corta con un aviso claro.
    global: { fetch: U.conLimiteDeTiempo((...args) => root.fetch(...args)) },
  });

  // Los pasos de fotos se pueden repetir sin dañar nada: si falla la red se reintenta solo (hasta 3 veces) y se avisa a la pantalla.
  const avisoReintento = (numero, de) => { if (api.alReintentar) api.alReintentar(numero, de); };
  const repetible = (trabajo) => U.reintentar(trabajo, { alReintentar: avisoReintento });

  function normalizar(error, estado) {
    return {
      message: String((error && (error.message || error.msg)) || ""),
      code: String((error && (error.code || error.error)) || ""),
      status: Number(estado || (error && (error.status || error.statusCode)) || 0) || 0,
      details: error && error.details ? String(error.details) : "",
    };
  }

  /** Resuelve una consulta de PostgREST: devuelve los datos o lanza el error normalizado. */
  async function q(consulta) {
    let res;
    try { res = await consulta; } catch (e) { throw normalizar(e, 0); }
    if (res.error) throw normalizar(res.error, res.status);
    return res;
  }

  const porNombre = (a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" });

  // ---------------------------------------------------------------- sesion
  async function sesion() {
    const { data, error } = await sb.auth.getSession();
    if (data.session) return data.session;
    // Sin senal no se pudo renovar el permiso, pero la sesion guardada sigue valida: NO se debe pedir la clave otra vez.
    if (error && (error.name === "AuthRetryableFetchError" || error.status === 0 || /failed to fetch|network|load failed/i.test(String(error.message || "")))) {
      throw { message: "sin conexion", code: "sin_red", status: 0 };
    }
    if (!error && root.navigator && root.navigator.onLine === false && tieneSesionGuardada()) throw { message: "sin conexion", code: "sin_red", status: 0 };
    return null;
  }

  /** ¿Hay una sesion guardada en este celular? (solo mira si existe, no la usa). */
  function tieneSesionGuardada() {
    try { return !!root.localStorage.getItem("vitrina-marcos-auth"); } catch { return false; }
  }

  async function entrar(usuario, clave) {
    const correo = U.emailDeUsuario(usuario, CFG.loginDomain);
    if (!correo) throw { message: "Invalid login credentials", status: 400, code: "" };
    const { data, error } = await sb.auth.signInWithPassword({ email: correo, password: clave });
    if (error) throw normalizar(error, error.status);
    return data.session;
  }

  async function salir() {
    try { await sb.auth.signOut(); } catch { /* aunque falle la red, la sesion local se borra */ }
    try { await sb.auth.signOut({ scope: "local" }); } catch { /* nada */ }
  }

  /** Su tienda (la politica solo deja ver la suya). Devuelve { tienda } o { problema } con el motivo si la cuenta no sirve. */
  async function cargarTienda() {
    const { data } = await q(sb.from("sellers").select("id, slug, name, whatsapp, address, hours, about, status").limit(3));
    if (!data.length) return { problema: "Tu cuenta todavía no tiene una tienda asignada. Avísale a Adrián." };
    if (data.length > 1) return { problema: "Esta cuenta es del personal de BoomArt. Para este portal entra con el usuario de la tienda." };
    return { tienda: data[0] };
  }

  async function guardarTienda(id, campos) {
    const { data } = await q(sb.from("sellers").update(campos).eq("id", id).select("id, slug, name, whatsapp, address, hours, about, status"));
    if (!data.length) throw { message: "row-level security", code: "42501", status: 403 };
    return data[0];
  }

  // ---------------------------------------------------------------- categorias
  async function secciones() {
    const { data } = await q(sb.from("sections").select("id, name").order("name").limit(1000));
    return data.sort(porNombre);
  }

  async function colecciones() {
    const { data } = await q(sb.from("collections").select("id, section_id, name").order("name").limit(1000));
    return data.sort(porNombre);
  }

  async function crearSeccion(vendedorId, nombre) {
    const { data } = await q(sb.from("sections").insert({ id: U.nuevoId(), seller_id: vendedorId, name: nombre }).select("id, name").single());
    return data;
  }

  async function crearColeccion(vendedorId, seccionId, nombre) {
    const { data } = await q(sb.from("collections").insert({ id: U.nuevoId(), seller_id: vendedorId, section_id: seccionId, name: nombre }).select("id, section_id, name").single());
    return data;
  }

  async function renombrarSeccion(id, nombre) {
    const { data } = await q(sb.from("sections").update({ name: nombre }).eq("id", id).select("id, name"));
    if (!data.length) throw { message: "row-level security", code: "42501", status: 403 };
    return data[0];
  }

  async function renombrarColeccion(id, nombre) {
    const { data } = await q(sb.from("collections").update({ name: nombre }).eq("id", id).select("id, section_id, name"));
    if (!data.length) throw { message: "row-level security", code: "42501", status: 403 };
    return data[0];
  }

  async function borrarSeccion(id) {
    await q(sb.from("sections").delete().eq("id", id));
  }

  async function borrarColeccion(id) {
    await q(sb.from("collections").delete().eq("id", id));
  }

  /** Cuantos productos hay por seccion y por coleccion (se pagina: el servidor entrega 1000 filas por consulta). */
  async function conteoPorCategoria() {
    const porSeccion = {};
    const porColeccion = {};
    for (let desde = 0; ; desde += 1000) {
      const { data } = await q(sb.from("products").select("section_id, collection_id").order("id").range(desde, desde + 999));
      for (const fila of data) {
        if (fila.section_id) porSeccion[fila.section_id] = (porSeccion[fila.section_id] || 0) + 1;
        if (fila.collection_id) porColeccion[fila.collection_id] = (porColeccion[fila.collection_id] || 0) + 1;
      }
      if (data.length < 1000) break;
    }
    return { porSeccion, porColeccion };
  }

  // ---------------------------------------------------------------- productos
  async function contarEstados() {
    const base = () => sb.from("products").select("id", { count: "exact", head: true });
    const [todos, borrador, enValidacion, aprobado, cambios, ocultos] = await Promise.all([
      q(base()), q(base().eq("review_state", "borrador")), q(base().eq("review_state", "en_validacion")),
      q(base().eq("review_state", "aprobado")), q(base().eq("review_state", "cambios_pedidos")),
      q(base().or("visible.eq.false,admin_hidden.eq.true")),
    ]);
    return {
      todos: todos.count || 0, borrador: borrador.count || 0, en_validacion: enValidacion.count || 0,
      aprobado: aprobado.count || 0, cambios_pedidos: cambios.count || 0, ocultos: ocultos.count || 0,
    };
  }

  function aplicarFiltro(consulta, filtro, texto) {
    let c = consulta;
    if (filtro === "ocultos") c = c.or("visible.eq.false,admin_hidden.eq.true");
    else if (filtro && filtro !== "todos") c = c.eq("review_state", filtro);
    const buscado = String(texto || "").trim();
    if (buscado) {
      if (/^p\d{1,6}$/i.test(buscado)) c = c.ilike("code", `${U.escaparLike(buscado)}%`);
      else c = c.ilike("title", `%${U.escaparLike(buscado)}%`);
    }
    return c;
  }

  /** Una tanda de productos (con su foto de portada) para las listas. Devuelve { filas, hayMas }. */
  async function listarProductos({ filtro, texto, desde, cantidad, orden, soloAgotados }) {
    const total = cantidad || 25;
    let c = aplicarFiltro(sb.from("products").select(CAMPOS_LISTA), filtro, texto);
    if (soloAgotados) c = c.eq("qty", 0);
    c = orden === "nombre" ? c.order("title", { ascending: true }).order("id") : c.order("created_at", { ascending: false }).order("id");
    const { data } = await q(c.range(desde || 0, (desde || 0) + total));      // pide una de mas para saber si hay otra tanda
    return { filas: data.slice(0, total), hayMas: data.length > total };
  }

  /** Todos los productos sin enviar (borradores), con la cantidad de fotos, para armar «Mandar a validar». */
  async function productosSinEnviar() {
    const todos = [];
    for (let desde = 0; ; desde += 500) {
      const { data } = await q(sb.from("products")
        .select("id, code, title, price, qty, visible, admin_hidden, review_state, review_note, published_at, section_id, collection_id, created_at, product_photos(position, thumb_path)")
        .eq("review_state", "borrador").order("created_at", { ascending: false }).order("id").range(desde, desde + 499));
      todos.push(...data);
      if (data.length < 500) break;
    }
    return todos;
  }

  async function productosConCambios(limite) {
    const { data } = await q(sb.from("products").select("id, title, review_note").eq("review_state", "cambios_pedidos").order("submitted_at", { ascending: false, nullsFirst: false }).limit(limite || 5));
    return data;
  }

  async function obtenerProducto(id) {
    const { data } = await q(sb.from("products")
      .select("id, seller_id, code, title, description, price, qty, show_qty, visible, admin_hidden, section_id, collection_id, review_state, review_note, published_at, submitted_at, product_photos(id, position, path, thumb_path, bytes)")
      .eq("id", id).maybeSingle());
    if (data && Array.isArray(data.product_photos)) data.product_photos.sort((a, b) => a.position - b.position);
    return data;
  }

  async function productoExiste(id) {
    const { data } = await q(sb.from("products").select("id").eq("id", id).maybeSingle());
    return !!data;
  }

  async function crearProducto(producto) {
    await q(sb.from("products").insert(producto));
  }

  /** Actualiza y confirma que de verdad se cambio una fila (si la politica lo impide, no da error: devuelve 0 filas). */
  async function actualizarProducto(id, campos) {
    const { data } = await q(sb.from("products").update(campos).eq("id", id).select("id, review_state, published_at, review_note"));
    if (!data.length) throw { message: "row-level security", code: "42501", status: 403 };
    return data[0];
  }

  async function borrarProducto(id) {
    const { data } = await q(sb.from("products").delete().eq("id", id).select("id"));
    if (!data.length) throw { message: "row-level security", code: "42501", status: 403 };
  }

  // ---------------------------------------------------------------- fotos
  function subirArchivo(ruta, blob, mime) {
    return repetible(async () => {
      let res;
      try { res = await sb.storage.from(BUCKET).upload(ruta, blob, { contentType: mime, upsert: false }); } catch (e) { throw normalizar(e, 0); }
      if (res.error) {
        const mensaje = String(res.error.message || "");
        if (/already exists|duplicate/i.test(mensaje) || String(res.error.statusCode) === "409") return;   // ya estaba subido: reintento seguro
        throw normalizar(res.error, res.error.statusCode || res.error.status);
      }
    });
  }

  function quitarArchivos(rutas) {
    if (!rutas.length) return Promise.resolve();
    return repetible(async () => {
      let res;
      try { res = await sb.storage.from(BUCKET).remove(rutas); } catch (e) { throw normalizar(e, 0); }
      if (res.error) throw normalizar(res.error, res.error.statusCode || res.error.status);
    });
  }

  function insertarFoto(fila) {
    return repetible(async () => {
      try {
        await q(sb.from("product_photos").insert(fila));
      } catch (e) {
        if (e.code === "23505") return;       // la fila ya estaba (reintento tras un corte): esta bien
        throw e;
      }
    });
  }

  function borrarFilaFoto(id) {
    return repetible(() => q(sb.from("product_photos").delete().eq("id", id)));
  }

  function moverFoto(id, posicion) {
    return repetible(() => q(sb.from("product_photos").update({ position: posicion }).eq("id", id)));
  }

  // Las fotos de borrador son privadas: se muestran con direcciones firmadas (1 hora), pedidas en lote y guardadas en memoria.
  const firmadas = new Map();
  async function urlsFirmadas(rutas) {
    const ahora = Date.now();
    const faltan = [...new Set(rutas.filter(Boolean))].filter((r) => !firmadas.has(r) || firmadas.get(r).vence < ahora);
    for (let i = 0; i < faltan.length; i += 100) {
      const lote = faltan.slice(i, i + 100);
      let res;
      try { res = await sb.storage.from(BUCKET).createSignedUrls(lote, 3600); } catch { continue; }
      if (res.error || !Array.isArray(res.data)) continue;
      for (const fila of res.data) if (fila.signedUrl) firmadas.set(fila.path, { url: fila.signedUrl, vence: ahora + 55 * 60 * 1000 });
    }
    const mapa = {};
    for (const r of rutas) if (r && firmadas.has(r)) mapa[r] = firmadas.get(r).url;
    return mapa;
  }

  function olvidarFirmadas() { firmadas.clear(); }

  const api = root.VitrinaDatos = {
    alReintentar: null,       // la pantalla de guardado lo pone para mostrar «reintentando…» (lo usa fotos.js)
    sb, BUCKET, normalizar,
    sesion, tieneSesionGuardada, entrar, salir, cargarTienda, guardarTienda,
    secciones, colecciones, crearSeccion, crearColeccion, renombrarSeccion, renombrarColeccion, borrarSeccion, borrarColeccion, conteoPorCategoria,
    contarEstados, listarProductos, productosSinEnviar, productosConCambios, obtenerProducto, productoExiste, crearProducto, actualizarProducto, borrarProducto,
    subirArchivo, quitarArchivos, insertarFoto, borrarFilaFoto, moverFoto, urlsFirmadas, olvidarFirmadas,
  };
})(window);
