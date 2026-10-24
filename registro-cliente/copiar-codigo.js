(function () {
  "use strict";
  window.BoomartCopiarCodigo = async (codigo, boton, estado, elemento) => {
    let copiado = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(codigo);
        copiado = true;
      }
    } catch (_) { /* Navegadores integrados pueden bloquear Clipboard API. */ }
    if (!copiado) {
      const campo = document.createElement("textarea");
      campo.value = codigo;
      campo.setAttribute("readonly", "");
      campo.style.cssText = "position:fixed;left:0;top:0;opacity:0;font-size:16px";
      document.body.append(campo);
      try { campo.focus(); campo.select(); campo.setSelectionRange(0,codigo.length); copiado = document.execCommand("copy"); }
      catch (_) { /* Se ofrece selección manual si tampoco permite copiar. */ }
      finally { campo.remove(); boton.focus(); }
    }
    boton.textContent = copiado ? "✓ Copiado" : "Copiar código";
    estado.textContent = copiado ? "Ahora pégalo en tu chat de WhatsApp con BoomArt."
      : "Mantén pulsado el código para copiarlo, o usa el botón de WhatsApp.";
    if (!copiado && elemento) {
      const rango = document.createRange(); rango.selectNodeContents(elemento);
      const seleccion = window.getSelection(); seleccion.removeAllRanges(); seleccion.addRange(rango);
    }
    return copiado;
  };
})();
