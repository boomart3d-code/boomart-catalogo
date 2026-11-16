/*
 * Borrador del producto que Marcos esta publicando, guardado en el propio celular (IndexedDB) para no perder nada:
 * si el navegador recarga la pagina al volver de la camara, si se corta el internet o si cierra la pestana, al volver sigue donde iba.
 * Es solo comodidad: si el navegador no deja guardar (modo privado, sin espacio), todo sigue funcionando en memoria.
 * Nunca guarda claves ni datos de otros vendedores: cada borrador lleva el id de su vendedor.
 */
(function (root) {
  "use strict";
  const NOMBRE = "vitrina-marcos";
  const ALMACEN = "borradores";
  let abierta = null;

  function abrir() {
    if (abierta) return abierta;
    abierta = new Promise((resolver) => {
      try {
        if (!root.indexedDB) return resolver(null);
        const pedido = root.indexedDB.open(NOMBRE, 1);
        pedido.onupgradeneeded = () => { pedido.result.createObjectStore(ALMACEN, { keyPath: "k" }); };
        pedido.onsuccess = () => resolver(pedido.result);
        pedido.onerror = () => resolver(null);
        pedido.onblocked = () => resolver(null);
      } catch { resolver(null); }
    });
    return abierta;
  }

  function transaccion(modo, trabajo) {
    return abrir().then((db) => new Promise((resolver) => {
      if (!db) return resolver(null);
      try {
        const tx = db.transaction(ALMACEN, modo);
        const almacen = tx.objectStore(ALMACEN);
        let resultado = null;
        trabajo(almacen, (valor) => { resultado = valor; });
        tx.oncomplete = () => resolver(resultado);
        tx.onerror = () => resolver(null);
        tx.onabort = () => resolver(null);
      } catch { resolver(null); }
    }));
  }

  const claveCampos = (vendedor) => `${vendedor}|campos`;
  const claveFoto = (vendedor, id) => `${vendedor}|foto|${id}`;

  /** Devuelve { campos, fotos: [{...meta, blob, thumb}] } o null si no hay borrador. */
  async function leer(vendedor) {
    const campos = await transaccion("readonly", (almacen, dar) => {
      const pedido = almacen.get(claveCampos(vendedor));
      pedido.onsuccess = () => dar(pedido.result || null);
    });
    if (!campos || !campos.datos) return null;
    const fotos = [];
    for (const meta of campos.datos.fotos || []) {
      const registro = await transaccion("readonly", (almacen, dar) => {
        const pedido = almacen.get(claveFoto(vendedor, meta.id));
        pedido.onsuccess = () => dar(pedido.result || null);
      });
      if (registro && registro.blob && registro.thumb) fotos.push({ ...meta, blob: registro.blob, thumb: registro.thumb });
    }
    return { datos: { ...campos.datos, fotos: undefined }, fotos };
  }

  /** `datos` es solo texto/numeros (sin blobs): campos del formulario, paso, progreso y la lista de fotos (meta). */
  function guardarCampos(vendedor, datos) {
    return transaccion("readwrite", (almacen) => { almacen.put({ k: claveCampos(vendedor), datos, guardado: Date.now() }); });
  }

  function guardarFoto(vendedor, foto) {
    return transaccion("readwrite", (almacen) => {
      almacen.put({ k: claveFoto(vendedor, foto.id), blob: foto.blob, thumb: foto.thumb });
    });
  }

  function quitarFoto(vendedor, id) {
    return transaccion("readwrite", (almacen) => { almacen.delete(claveFoto(vendedor, id)); });
  }

  async function borrar(vendedor) {
    const actual = await transaccion("readonly", (almacen, dar) => {
      const pedido = almacen.get(claveCampos(vendedor));
      pedido.onsuccess = () => dar(pedido.result || null);
    });
    const ids = actual && actual.datos && Array.isArray(actual.datos.fotos) ? actual.datos.fotos.map((f) => f.id) : [];
    return transaccion("readwrite", (almacen) => {
      almacen.delete(claveCampos(vendedor));
      for (const id of ids) almacen.delete(claveFoto(vendedor, id));
    });
  }

  root.VitrinaBorrador = { leer, guardarCampos, guardarFoto, quitarFoto, borrar };
})(window);
