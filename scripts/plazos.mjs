// Plazo de fabricacion bajo pedido de cada producto. Funciones puras (sin leer archivos) para que el
// generador y las pruebas usen exactamente la misma logica. Los datos viven en data/plazos-fabricacion.json.

import { norm } from "./ads-taxonomy.mjs";

/** Errores de escritura de la configuracion (lista vacia = correcta). */
export function validatePlazos(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== "object") return ["La configuracion de plazos no es un objeto"];
  const niveles = cfg.niveles && typeof cfg.niveles === "object" ? Object.keys(cfg.niveles) : [];
  if (!niveles.length) errors.push('Falta "niveles"');
  for (const k of niveles) if (!String(cfg.niveles[k]?.texto || "").trim()) errors.push(`niveles.${k}: falta "texto"`);
  for (const k of ["sencillo", "elaborado"]) if (!niveles.includes(k)) errors.push(`Falta el nivel "${k}"`);
  if (!niveles.includes(cfg.nivelPorDefecto)) errors.push('"nivelPorDefecto" no es un nivel existente');
  const r = cfg.reglaElaborado || {};
  for (const k of Object.keys(r)) if (!["precioMin", "etiquetas", "idPatron"].includes(k)) errors.push(`reglaElaborado: condicion desconocida "${k}"`);
  if ("precioMin" in r && !(Number(r.precioMin) > 0)) errors.push("reglaElaborado.precioMin debe ser un numero positivo");
  if ("etiquetas" in r && (!Array.isArray(r.etiquetas) || r.etiquetas.some((x) => typeof x !== "string" || !x.trim()))) errors.push("reglaElaborado.etiquetas debe ser una lista de textos");
  if ("idPatron" in r) {
    try {
      new RegExp(r.idPatron);
    } catch {
      errors.push("reglaElaborado.idPatron no es una expresion regular valida");
    }
  }
  for (const k of ["forzarSencillo", "forzarElaborado"]) if (!Array.isArray(cfg[k])) errors.push(`"${k}" debe ser una lista`);
  if (Array.isArray(cfg.forzarSencillo) && Array.isArray(cfg.forzarElaborado)) {
    const both = cfg.forzarSencillo.filter((id) => cfg.forzarElaborado.includes(id));
    if (both.length) errors.push(`Productos en forzarSencillo y forzarElaborado a la vez: ${both.join(", ")}`);
  }
  return errors;
}

/**
 * Plazo de un producto: { nivel, texto, porRegla }.
 *  - basePrice: precio base del producto en soles
 */
export function plazoOf(p, cfg, basePrice) {
  const dar = (nivel, porRegla) => ({ nivel, texto: cfg.niveles[nivel].texto, porRegla });
  if (cfg.forzarSencillo.includes(p.id)) return dar("sencillo", false);
  if (cfg.forzarElaborado.includes(p.id)) return dar("elaborado", false);
  const r = cfg.reglaElaborado || {};
  const tags = (p.tags || []).map(norm);
  const elaborado =
    (r.precioMin != null && Number(basePrice) >= Number(r.precioMin)) ||
    (r.etiquetas || []).some((t) => tags.includes(norm(t))) ||
    (r.idPatron ? new RegExp(r.idPatron).test(p.id) : false);
  return dar(elaborado ? "elaborado" : cfg.nivelPorDefecto, true);
}
