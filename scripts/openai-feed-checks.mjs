// Comprobaciones del feed de OpenAI (ChatGPT Ads). Funciones puras: reciben los datos ya
// leidos y devuelven { errors, warnings }, asi las usan tanto validate-feeds.mjs como las
// pruebas (openai-feed.test.mjs) con casos inventados para demostrar que detectan cada fallo.
// Especificacion: https://developers.openai.com/commerce/product-feeds/spec

export const REQUIRED = ["item_id", "title", "description", "url", "brand", "seller_name", "image_url", "availability", "price"];
export const AVAILABILITY = ["in_stock", "out_of_stock", "pre_order", "backorder", "unknown"];
export const CONDITIONS = ["new", "refurbished", "used"];
const EMOJI = /\p{Extended_Pictographic}/u;
const isEmpty = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
const isHttps = (u) => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && !/\s/.test(u);
  } catch {
    return false;
  }
};

/** Estructura de las filas: incompletas, duplicadas, mal formadas. */
export function checkRows(rows, { temas = null } = {}) {
  const errors = [];
  const warnings = [];
  const seenId = new Map();
  const seenOffer = new Set();
  const seenTitle = new Map();
  const groups = new Map();
  const imageOwners = new Map();
  for (const row of rows) {
    const where = `feed-openai ${row.item_id ?? "(sin item_id)"}`;
    for (const f of REQUIRED) if (isEmpty(row[f])) errors.push(`${where}: falta ${f}`);
    if (row.item_id != null) {
      if (seenId.has(row.item_id)) errors.push(`${where}: item_id repetido`);
      seenId.set(row.item_id, true);
    }
    if (!isEmpty(row.offer_id)) {
      if (seenOffer.has(row.offer_id)) errors.push(`${where}: offer_id repetido`);
      seenOffer.add(row.offer_id);
    }
    const titleKey = String(row.title ?? "").trim().toLowerCase();
    if (titleKey) {
      if (seenTitle.has(titleKey)) errors.push(`${where}: titulo duplicado con ${seenTitle.get(titleKey)} ("${row.title}")`);
      seenTitle.set(titleKey, row.item_id);
    }
    if (!AVAILABILITY.includes(row.availability)) errors.push(`${where}: availability invalido (${row.availability})`);
    if (!/^\d+(\.\d{1,2})? [A-Z]{3}$/.test(String(row.price)) || !(parseFloat(row.price) > 0)) errors.push(`${where}: price invalido (${row.price})`);
    else if (!String(row.price).endsWith(" PEN")) errors.push(`${where}: la moneda deberia ser PEN (${row.price})`);
    if ([...String(row.title ?? "")].length > 150) errors.push(`${where}: titulo de mas de 150 caracteres`);
    if (row.title && String(row.title).trim().toLowerCase() === String(row.item_id).toLowerCase()) errors.push(`${where}: el titulo es igual al identificador`);
    if ([...String(row.description ?? "")].length > 5000) errors.push(`${where}: descripcion de mas de 5000 caracteres`);
    else if (row.description && String(row.description).length < 40) warnings.push(`${where}: descripcion muy corta (${String(row.description).length} caracteres)`);
    if (EMOJI.test(String(row.title ?? "")) || EMOJI.test(String(row.description ?? ""))) errors.push(`${where}: emoji en titulo o descripcion`);
    if (!isEmpty(row.url) && !isHttps(row.url)) errors.push(`${where}: url no es una direccion HTTPS valida`);
    if (!isEmpty(row.image_url) && !isHttps(row.image_url)) errors.push(`${where}: image_url no es una direccion HTTPS valida`);
    for (const u of row.additional_image_urls || []) if (!isHttps(u)) errors.push(`${where}: additional_image_urls tiene una direccion invalida (${u})`);
    if (row.condition !== undefined && !CONDITIONS.includes(row.condition)) errors.push(`${where}: condition invalido (${row.condition})`);
    for (const f of ["is_eligible_search", "is_ads_eligible"]) {
      if (row[f] !== undefined && typeof row[f] !== "boolean") errors.push(`${where}: ${f} debe ser true o false`);
    }
    // Variantes: grupo distinto del item_id, opcion con nombre, opciones sin repetir.
    if (row.listing_has_variations) {
      if (isEmpty(row.group_id) || row.group_id === row.item_id) errors.push(`${where}: group_id vacio o igual a item_id`);
      if (!row.variant_dict || !Object.keys(row.variant_dict).length) errors.push(`${where}: variante sin variant_dict`);
      else if (Object.entries(row.variant_dict).some(([k, v]) => isEmpty(k) || isEmpty(v))) errors.push(`${where}: variant_dict con claves o valores vacios`);
      if (!isEmpty(row.group_id)) (groups.get(row.group_id) || groups.set(row.group_id, []).get(row.group_id)).push(row);
    } else if (!isEmpty(row.group_id) && row.group_id !== row.item_id) {
      errors.push(`${where}: tiene group_id pero no marca listing_has_variations`);
    }
    // Etiquetas y categoria para campanas
    const label = row.ads_metadata?.custom_label_0;
    if (row.is_ads_eligible === true) {
      if (isEmpty(label)) errors.push(`${where}: es elegible para anuncios pero no tiene ads_metadata.custom_label_0`);
      else if (temas && !temas.includes(label)) errors.push(`${where}: custom_label_0 "${label}" no es una tematica conocida`);
    }
    if (row.ads_metadata && Object.keys(row.ads_metadata).some((k) => k !== "custom_label_0")) {
      errors.push(`${where}: ads_metadata usa claves que la guia de OpenAI no documenta (${Object.keys(row.ads_metadata).join(", ")})`);
    }
    if (isEmpty(row.product_category)) warnings.push(`${where}: sin product_category`);
    else if (!/^[^>]+( > [^>]+)*$/.test(String(row.product_category))) errors.push(`${where}: product_category mal escrito ("${row.product_category}")`);
    // Misma foto principal en productos distintos (las variantes de un grupo pueden compartirla)
    if (row.image_url) {
      const owner = row.group_id || row.item_id;
      const list = imageOwners.get(row.image_url) || imageOwners.set(row.image_url, new Set()).get(row.image_url);
      list.add(owner);
    }
  }
  for (const [g, list] of groups) {
    if (list.length < 2) errors.push(`feed-openai ${g}: un grupo de variantes con una sola fila`);
    if (new Set(list.map((r) => Object.keys(r.variant_dict || {}).join("|"))).size > 1) errors.push(`feed-openai ${g}: las variantes usan nombres de opcion distintos`);
    const opts = list.map((r) => Object.values(r.variant_dict || {}).join("|"));
    if (new Set(opts).size !== opts.length) errors.push(`feed-openai ${g}: opciones repetidas`);
    if (new Set(list.map((r) => r.url)).size > 1) warnings.push(`feed-openai ${g}: las variantes apuntan a URLs distintas`);
  }
  for (const [img, owners] of imageOwners) {
    if (owners.size > 1) warnings.push(`misma foto principal en productos distintos (${[...owners].join(", ")}): ${img}`);
  }
  const cats = new Set(rows.map((r) => r.product_category).filter(Boolean));
  if (rows.length > 10 && cats.size < 3) warnings.push(`solo ${cats.size} product_category distinta(s) en ${rows.length} filas: no sirve para armar grupos de campana`);
  return { errors, warnings };
}

/**
 * Feed contra el catalogo: faltan productos, sobran productos retirados o los precios no coinciden.
 *  - expected: Map(item_id -> { price: "100.00 PEN" }) construido desde las fichas/catalogo
 */
export function checkAgainstCatalog(rows, expected) {
  const errors = [];
  const byId = new Map(rows.map((r) => [r.item_id, r]));
  for (const [id, e] of expected) {
    const r = byId.get(id);
    if (!r) errors.push(`feed-openai: falta ${id} (esta en el catalogo)`);
    else if (e.price && r.price !== e.price) errors.push(`feed-openai ${id}: precio ${r.price} desactualizado; el catalogo dice ${e.price}`);
  }
  for (const r of rows) if (!expected.has(r.item_id)) errors.push(`feed-openai ${r.item_id}: no existe en el catalogo (producto retirado o id viejo)`);
  return { errors, warnings: [] };
}

/** Documento de grupos: consistente con el feed y sin productos huerfanos. */
export function checkGroupsDoc(doc, rows) {
  const errors = [];
  const warnings = [];
  const ids = new Set(rows.map((r) => r.item_id));
  if (!doc || !Array.isArray(doc.grupos) || !Array.isArray(doc.categorias)) return { errors: ["feed-openai-grupos.json no tiene la estructura esperada"], warnings };
  if (doc.sinGrupo?.length) errors.push(`productos que no estan en ningun grupo: ${doc.sinGrupo.join(", ")}`);
  if (doc.sinTema?.length) errors.push(`productos sin tematica asignada (cayeron en la regla por defecto): ${doc.sinTema.join(", ")}`);
  if (!/NO garantiza/.test(doc.aviso || "")) errors.push("el archivo de grupos perdio el aviso de que no garantiza impresiones");
  for (const g of doc.grupos) {
    const values = g.filtroItemId?.values || [];
    if (!values.length) errors.push(`grupo ${g.id}: esta vacio`);
    for (const v of values) if (!ids.has(v)) errors.push(`grupo ${g.id}: el item_id ${v} no existe en el feed`);
    if (new Set(values).size !== values.length) errors.push(`grupo ${g.id}: item_id repetidos`);
  }
  for (const c of doc.categorias) {
    for (const v of c.item_ids) if (!ids.has(v)) errors.push(`categoria "${c.product_category}": el item_id ${v} no existe en el feed`);
  }
  const inCategories = new Set(doc.categorias.flatMap((c) => c.item_ids));
  for (const r of rows) {
    if (!inCategories.has(r.item_id)) errors.push(`feed-openai ${r.item_id}: no aparece en ninguna categoria del archivo de grupos`);
    const doc_path = doc.categorias.find((c) => c.item_ids.includes(r.item_id))?.product_category;
    if (doc_path && doc_path !== r.product_category) errors.push(`feed-openai ${r.item_id}: product_category del feed ("${r.product_category}") distinta de la del archivo de grupos ("${doc_path}")`);
  }
  return { errors, warnings };
}

/** Metadatos: la huella corresponde a los archivos y los conteos coinciden. */
export function checkMeta(meta, { rows, jsonlSha, csvSha, products, now = new Date() }) {
  const errors = [];
  const warnings = [];
  if (!meta) return { errors: ["falta feed-openai.meta.json"], warnings };
  if (meta.sha256Jsonl !== jsonlSha) errors.push("feed-openai.meta.json: la huella del JSONL no coincide con el archivo (feed desactualizado o editado a mano)");
  if (meta.sha256Csv !== csvSha) errors.push("feed-openai.meta.json: la huella del CSV no coincide con el archivo");
  if (meta.filas !== rows.length) errors.push(`feed-openai.meta.json: dice ${meta.filas} filas y el feed tiene ${rows.length}`);
  if (products != null && meta.productos !== products) errors.push(`feed-openai.meta.json: dice ${meta.productos} productos y el catalogo tiene ${products}`);
  if (meta.moneda !== "PEN") errors.push(`feed-openai.meta.json: moneda ${meta.moneda}`);
  const when = new Date(`${meta.generadoEl}T00:00:00Z`);
  if (Number.isNaN(when.getTime())) errors.push("feed-openai.meta.json: generadoEl no es una fecha valida");
  else if (when.getTime() - now.getTime() > 36 * 3600e3) errors.push(`feed-openai.meta.json: generadoEl esta en el futuro (${meta.generadoEl})`);
  return { errors, warnings };
}

/**
 * Enlaces rotos: la pagina y las fotos de cada fila existen. `exists(rutaRelativa)` devuelve una promesa
 * de verdadero/falso (en el repositorio es un acceso a disco; en las pruebas, una lista inventada).
 */
export async function checkLocalLinks(rows, exists, { site = "https://boomart.pe" } = {}) {
  const errors = [];
  const rel = (u) => decodeURIComponent(u.slice(site.length + 1).split("?")[0]);
  for (const row of rows) {
    const where = `feed-openai ${row.item_id}`;
    for (const u of [row.image_url, ...(row.additional_image_urls || [])]) {
      if (!String(u).startsWith(`${site}/`)) errors.push(`${where}: la foto ${u} no es del sitio ${site}`);
      else if (!(await exists(rel(u)))) errors.push(`${where}: la foto ${u} no existe en el repositorio`);
    }
    if (!String(row.url).startsWith(`${site}/`)) errors.push(`${where}: la url ${row.url} no es del sitio ${site}`);
    else if (!(await exists(`${rel(row.url)}index.html`))) errors.push(`${where}: la pagina ${row.url} no existe`);
  }
  return { errors, warnings: [] };
}
