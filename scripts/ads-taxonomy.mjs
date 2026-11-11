// Reglas de tematica y grupos de campana para ChatGPT Ads.
// Funciones puras (sin leer archivos ni red) para que el generador y las pruebas usen
// exactamente la misma logica. Las reglas viven en data/ads-grupos.json.

const CLAUSE_KEYS = ["categorias", "etiquetas", "ids", "idPatron", "temas", "precioMax"];
const RULE_META_KEYS = ["tema", "ruta"];
const GROUP_KEYS = ["id", "nombre", "descripcion", "sugerenciaContexto", "reglas"];

/** Sin tildes, sin mayusculas y sin espacios sobrantes: "Máscaras " == "mascaras". */
export const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Categoria principal y categorias extra de un producto. */
export const categoriesOf = (p) => [p.category, ...(p.extraCategories || [])].filter(Boolean);

/** Devuelve la lista de errores de escritura de la configuracion (vacia = correcta). */
export function validateAdsConfig(cfg) {
  const errors = [];
  const checkClause = (c, where) => {
    if (!c || typeof c !== "object" || Array.isArray(c)) return errors.push(`${where}: no es un objeto`);
    for (const k of Object.keys(c)) {
      if (RULE_META_KEYS.includes(k)) continue;
      if (!CLAUSE_KEYS.includes(k)) errors.push(`${where}: condicion desconocida "${k}"`);
    }
    for (const k of ["categorias", "etiquetas", "ids", "temas"]) {
      if (k in c && (!Array.isArray(c[k]) || !c[k].length || c[k].some((x) => typeof x !== "string" || !x.trim()))) {
        errors.push(`${where}: "${k}" debe ser una lista de textos no vacia`);
      }
    }
    if ("idPatron" in c) {
      try {
        new RegExp(c.idPatron);
      } catch {
        errors.push(`${where}: idPatron no es una expresion regular valida`);
      }
    }
    if ("precioMax" in c && !(Number(c.precioMax) > 0)) errors.push(`${where}: precioMax debe ser un numero positivo`);
    if (!CLAUSE_KEYS.some((k) => k in c)) errors.push(`${where}: no tiene ninguna condicion (coincidiria con todo)`);
  };
  if (!cfg || typeof cfg !== "object") return ["La configuracion no es un objeto"];
  if (!Array.isArray(cfg.rutaPorDefecto) || !cfg.rutaPorDefecto.length) errors.push('Falta "rutaPorDefecto"');
  if (!cfg.temaPorDefecto) errors.push('Falta "temaPorDefecto"');
  (cfg.temaPrincipal || []).forEach((r, i) => {
    const where = `temaPrincipal[${i}]`;
    if (!r.tema || !/^[a-z0-9-]+$/.test(r.tema)) errors.push(`${where}: "tema" debe ser un texto en minusculas sin espacios (a-z, 0-9, -)`);
    if (!Array.isArray(r.ruta) || !r.ruta.length) errors.push(`${where}: falta "ruta"`);
    else if (r.ruta.some((x) => /[>]/.test(x))) errors.push(`${where}: la ruta no puede contener ">"`);
    checkClause(r, where);
    if ("temas" in r) errors.push(`${where}: una regla de tema principal no puede usar "temas"`);
  });
  if (!(cfg.temaPrincipal || []).length) errors.push('"temaPrincipal" esta vacio');
  const ids = new Set();
  (cfg.grupos || []).forEach((g, i) => {
    const where = `grupos[${i}]`;
    for (const k of Object.keys(g)) if (!GROUP_KEYS.includes(k)) errors.push(`${where}: campo desconocido "${k}"`);
    if (!g.id || !/^[a-z0-9-]+$/.test(g.id)) errors.push(`${where}: "id" debe ser un texto en minusculas sin espacios`);
    if (ids.has(g.id)) errors.push(`${where}: id repetido "${g.id}"`);
    ids.add(g.id);
    if (!g.nombre) errors.push(`${where}: falta "nombre"`);
    if (!Array.isArray(g.reglas) || !g.reglas.length) errors.push(`${where}: falta "reglas"`);
    else g.reglas.forEach((c, j) => checkClause(c, `${where}.reglas[${j}]`));
  });
  if (!(cfg.grupos || []).length) errors.push('"grupos" esta vacio');
  if (!Array.isArray(cfg.excluirDeAnuncios)) errors.push('"excluirDeAnuncios" debe ser una lista');
  if (!cfg.disponibilidad || typeof cfg.disponibilidad !== "object") errors.push('Falta "disponibilidad"');
  else {
    for (const k of ["bajoPedido", "sinDato"]) {
      if (!OPENAI_AVAILABILITY.includes(cfg.disponibilidad[k])) errors.push(`disponibilidad.${k} debe ser uno de: ${OPENAI_AVAILABILITY.join(", ")}`);
    }
    if (cfg.disponibilidad.sinDato === cfg.disponibilidad.bajoPedido) errors.push("disponibilidad.sinDato no puede ser igual a bajoPedido (no se distinguiria lo confirmado de lo no confirmado)");
  }
  return errors;
}

/** Estados de disponibilidad que acepta la especificacion de OpenAI. */
export const OPENAI_AVAILABILITY = ["in_stock", "out_of_stock", "pre_order", "backorder", "unknown"];

/**
 * Disponibilidad que se declara en el feed de OpenAI. Solo se declara el estado "bajo pedido" cuando
 * data/products.json confirma availability "A pedido"; sin ese dato el producto sale como `sinDato`.
 */
export function openAiAvailability(p, cfg) {
  const confirmada = norm(p.availability) === "a pedido";
  return { estado: confirmada ? cfg.disponibilidad.bajoPedido : cfg.disponibilidad.sinDato, confirmada };
}

/** ¿Cumple el producto TODAS las condiciones escritas en la clausula? */
export function matchesClause(p, clause, ctx) {
  const cats = categoriesOf(p).map(norm);
  const tags = (p.tags || []).map(norm);
  if (clause.categorias && !clause.categorias.some((x) => cats.includes(norm(x)))) return false;
  if (clause.etiquetas && !clause.etiquetas.some((x) => tags.includes(norm(x)))) return false;
  if (clause.ids && !clause.ids.includes(p.id)) return false;
  if (clause.idPatron && !new RegExp(clause.idPatron).test(p.id)) return false;
  if (clause.temas && !clause.temas.includes(ctx.tema)) return false;
  if (clause.precioMax != null && !(Number(ctx.price) <= Number(clause.precioMax))) return false;
  return true;
}

/** Tematica principal y ruta de categoria: gana la primera regla que coincida. */
export function classifyProduct(p, cfg) {
  const ctx = {};
  for (let i = 0; i < cfg.temaPrincipal.length; i++) {
    const r = cfg.temaPrincipal[i];
    if (matchesClause(p, r, ctx)) return { tema: r.tema, ruta: [...r.ruta], regla: i, porDefecto: false };
  }
  return { tema: cfg.temaPorDefecto, ruta: [...cfg.rutaPorDefecto], regla: -1, porDefecto: true };
}

/** Grupos de campana a los que pertenece un producto (pueden ser varios). */
export function groupsOf(p, cfg, { tema, price }) {
  return cfg.grupos.filter((g) => g.reglas.some((c) => matchesClause(p, c, { tema, price }))).map((g) => g.id);
}

/**
 * Documento de grupos: para cada grupo y cada ruta de categoria, los item_id del feed
 * (incluidas las variantes) listos para pegar como filtro 'item_id in [...]'.
 *  - products: data/products.json
 *  - rows: filas del feed (JSON). El producto de cada fila sale de su URL /producto/<id>/
 *  - priceOf(p): precio base del producto en soles
 */
export function buildGroupsDoc({ products, rows, cfg, priceOf, date }) {
  const rowsByProduct = new Map();
  for (const r of rows) {
    const id = String(r.url).split("/").filter(Boolean).pop();
    (rowsByProduct.get(id) || rowsByProduct.set(id, []).get(id)).push(r.item_id);
  }
  const info = products.map((p) => {
    const price = priceOf(p);
    const c = classifyProduct(p, cfg);
    return { p, price, ...c, grupos: groupsOf(p, cfg, { tema: c.tema, price }), items: rowsByProduct.get(p.id) || [] };
  });
  const byTema = new Map();
  const byRuta = new Map();
  for (const x of info) {
    byTema.set(x.tema, (byTema.get(x.tema) || 0) + 1);
    const key = x.ruta.join(" > ");
    (byRuta.get(key) || byRuta.set(key, []).get(key)).push(x);
  }
  const grupos = cfg.grupos.map((g) => {
    const miembros = info.filter((x) => x.grupos.includes(g.id));
    const prices = miembros.map((x) => x.price);
    return {
      id: g.id,
      nombre: g.nombre,
      descripcion: g.descripcion || "",
      sugerenciaContexto: g.sugerenciaContexto || "",
      productos: miembros.length,
      filas: miembros.reduce((n, x) => n + x.items.length, 0),
      precioMinPEN: prices.length ? Math.min(...prices) : null,
      precioMaxPEN: prices.length ? Math.max(...prices) : null,
      filtroItemId: { field: "item_id", operator: "in", values: miembros.flatMap((x) => x.items) },
      productIds: miembros.map((x) => x.p.id),
    };
  });
  return {
    version: 1,
    generadoEl: date,
    aviso:
      "Estos grupos solo ordenan el catalogo para que una campana elija productos. Que un producto coincida con un filtro NO garantiza impresiones ni apariciones: OpenAI decide la entrega segun la relevancia, la disponibilidad, la revision y el presupuesto.",
    campos:
      "ads_metadata.custom_label_0 = tematica principal (cada tema trae su filtroEtiqueta: ads_metadata.custom_label_0 in [tema]); product_category = ruta (filtrable con 'in', texto exacto); filtroItemId = lista de item_id lista para pegar en un grupo de anuncios.",
    temas: [...byTema.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tema, productos]) => ({
        tema,
        productos,
        // Filtro listo para un grupo de anuncios (guia de OpenAI: ads_metadata.<campo> con 'in', valores como texto)
        filtroEtiqueta: { field: "ads_metadata.custom_label_0", operator: "in", values: [tema] },
      })),
    categorias: [...byRuta.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "es"))
      .map(([ruta, xs]) => ({ product_category: ruta, productos: xs.length, item_ids: xs.flatMap((x) => x.items) })),
    grupos,
    sinGrupo: info.filter((x) => !x.grupos.length).map((x) => x.p.id),
    sinTema: info.filter((x) => x.porDefecto).map((x) => x.p.id),
  };
}
