/*
 * Compresion de fotos EN EL CELULAR antes de subirlas (obligatoria: el servidor rechaza archivos de mas de 300 KB).
 *  - Foto principal: lado mayor <= 900 px y <= 280 KB. Miniatura: lado mayor <= 360 px y <= 100 KB.
 *  - Respeta la orientacion del celular (createImageBitmap con "from-image"; si no existe, se usa <img>, que tambien la aplica).
 *  - Prefiere WebP; si el navegador devuelve otra cosa (png), usa JPEG.
 * Los calculos de tamanos y la lista de intentos son funciones puras de util.js (con pruebas).
 */
(function (root) {
  "use strict";
  const U = root.VitrinaUtil;
  let formatoPreferido = null;   // "image/webp" | "image/jpeg", se averigua una vez

  function falla(mensaje, codigo) {
    const error = new Error(mensaje);
    error.codigo = codigo;
    error.amable = mensaje;
    return error;
  }

  function aBlob(lienzo, mime, calidad) {
    return new Promise((resolver) => {
      try { lienzo.toBlob((blob) => resolver(blob), mime, calidad); } catch { resolver(null); }
    });
  }

  async function averiguarFormato() {
    if (formatoPreferido) return formatoPreferido;
    const lienzo = document.createElement("canvas");
    lienzo.width = 2; lienzo.height = 2;
    const blob = await aBlob(lienzo, "image/webp", 0.8);
    formatoPreferido = blob && blob.type === "image/webp" ? "image/webp" : "image/jpeg";
    return formatoPreferido;
  }

  function cargarConImg(archivo) {
    return new Promise((resolver, rechazar) => {
      const url = URL.createObjectURL(archivo);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolver({ fuente: img, ancho: img.naturalWidth, alto: img.naturalHeight, cerrar() {} }); };
      img.onerror = () => { URL.revokeObjectURL(url); rechazar(new Error("no se pudo leer")); };
      img.src = url;
    });
  }

  async function decodificar(archivo) {
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
        return { fuente: bitmap, ancho: bitmap.width, alto: bitmap.height, cerrar() { try { bitmap.close(); } catch { /* nada */ } } };
      } catch { /* navegador sin esa opcion: se usa <img> */ }
    }
    return cargarConImg(archivo);
  }

  /** Dibuja la imagen reducida sobre fondo blanco (para que lo transparente no quede negro en JPEG). */
  function dibujar(imagen, ancho, alto) {
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho; lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imagen.fuente, 0, 0, ancho, alto);
    return lienzo;
  }

  /** Baja calidad y luego tamano hasta que pese <= objetivo. Devuelve { blob, formato } o null si no se logra. */
  async function codificar(imagen, maxLado, objetivo) {
    let mime = await averiguarFormato();
    const lienzos = new Map();
    for (const intento of U.intentosCompresion(maxLado)) {
      const medida = U.tamanoImagen(imagen.ancho, imagen.alto, intento.lado);
      const clave = `${medida.ancho}x${medida.alto}`;
      if (!lienzos.has(clave)) lienzos.set(clave, dibujar(imagen, medida.ancho, medida.alto));
      let blob = await aBlob(lienzos.get(clave), mime, intento.calidad);
      let formato = blob ? U.formatoDeBlob(blob.type) : null;
      if (blob && !formato && mime === "image/webp") {         // el navegador no sabe WebP: pasa a JPEG para siempre
        formatoPreferido = "image/jpeg";
        mime = "image/jpeg";
        blob = await aBlob(lienzos.get(clave), mime, intento.calidad);
        formato = blob ? U.formatoDeBlob(blob.type) : null;
      }
      if (blob && formato && blob.size <= objetivo) return { blob, formato };
    }
    return null;
  }

  /**
   * Prepara una foto elegida por la persona. Devuelve
   * { blob, thumb, mime, ext, bytes, ancho, alto } o lanza un Error con `.amable` (texto para mostrar).
   */
  async function comprimir(archivo) {
    if (!archivo) throw falla("No se eligió ninguna foto.", "vacio");
    if (archivo.type && !/^image\//i.test(archivo.type)) throw falla("Ese archivo no es una foto. Elige una foto de tu galería o toma una nueva.", "no_imagen");
    let imagen;
    try {
      imagen = await decodificar(archivo);
    } catch {
      throw falla("No pudimos abrir esa foto. Prueba con otra.", "no_se_pudo_leer");
    }
    try {
      if (!(imagen.ancho > 0 && imagen.alto > 0)) throw falla("No pudimos abrir esa foto. Prueba con otra.", "no_se_pudo_leer");
      const principal = await codificar(imagen, U.LADO_PRINCIPAL, U.OBJETIVO_PRINCIPAL);
      if (!principal) throw falla("Esa foto es muy pesada y no se pudo reducir. Prueba con otra.", "muy_pesada");
      const miniatura = await codificar(imagen, U.LADO_MINIATURA, U.OBJETIVO_MINIATURA);
      if (!miniatura) throw falla("No se pudo preparar la miniatura de esa foto. Prueba con otra.", "muy_pesada");
      // los dos archivos de una foto deben tener la misma extension (la base valida la ruta de ambos con el mismo formato)
      let thumb = miniatura;
      if (miniatura.formato.ext !== principal.formato.ext) {
        const forzado = await codificarEnFormato(imagen, U.LADO_MINIATURA, U.OBJETIVO_MINIATURA, principal.formato.mime);
        if (!forzado) throw falla("No se pudo preparar la miniatura de esa foto. Prueba con otra.", "muy_pesada");
        thumb = forzado;
      }
      const medida = U.tamanoImagen(imagen.ancho, imagen.alto, U.LADO_PRINCIPAL);
      return { blob: principal.blob, thumb: thumb.blob, mime: principal.formato.mime, ext: principal.formato.ext, bytes: principal.blob.size, ancho: medida.ancho, alto: medida.alto };
    } finally {
      imagen.cerrar();
    }
  }

  async function codificarEnFormato(imagen, maxLado, objetivo, mime) {
    for (const intento of U.intentosCompresion(maxLado)) {
      const medida = U.tamanoImagen(imagen.ancho, imagen.alto, intento.lado);
      const blob = await aBlob(dibujar(imagen, medida.ancho, medida.alto), mime, intento.calidad);
      const formato = blob ? U.formatoDeBlob(blob.type) : null;
      if (blob && formato && formato.mime === mime && blob.size <= objetivo) return { blob, formato };
    }
    return null;
  }

  root.VitrinaImagen = { comprimir };
})(window);
