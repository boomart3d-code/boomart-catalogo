/* Reglas de catalogo reutilizables, sin DOM ni pagos. */
(function (root) {
  "use strict";
  const normalizar = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const precioConfirmado = p => typeof p.precio === "number" && Number.isFinite(p.precio) && p.precio > 0;
  function filtrar(productos, filtro) {
    const q = normalizar(filtro.busqueda);
    const lista = productos.filter(p => (!q || normalizar(`${p.nombre} ${p.tema} ${p.texto || ''}`).includes(q)) &&
      (!filtro.tema || filtro.tema === "todos" || p.tema === filtro.tema) &&
      (!filtro.color || filtro.color === "todos" || p.color === filtro.color));
    if (filtro.orden === "nombre") lista.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
    return lista;
  }
  function variante(p, genero, talla) {
    if (!['hombre','mujer'].includes(genero) || !(p.tallas || ['S','M','L']).includes(talla)) throw new Error('Selecciona corte y talla.');
    const corte = p.prenda === 'unisex' ? 'unisex' : genero;
    return {id:p.id,nombre:p.nombre,color:p.color,genero:corte,talla,clave:`${p.id}|${corte}|${p.color}|${talla}`};
  }
  const mensaje = v => `${v.nombre} · ${{unisex:'Unisex',mujer:'Mujer',hombre:'Hombre'}[v.genero]} · ${v.color} · talla ${v.talla}`;
  const api = {normalizar,precioConfirmado,filtrar,variante,mensaje};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.CATALOGO_UI=api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
