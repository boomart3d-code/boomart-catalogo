// Evaluacion del procesamiento del catalogo en OpenAI a partir del historial de cargas que devuelve la
// API de Ads (GET /v1/feeds/uploads, ver https://developers.openai.com/ads/product-feeds#monitoring-uploads).
// Funcion pura: recibe la lista ya descargada y devuelve { errors, warnings, resumen }.
// Estado: probada con las respuestas de ejemplo de la documentacion; NO probada contra la API real.

const UPLOAD_OK = ["completed", "completed_with_errors"];
const UPLOAD_PENDING = ["scanning", "received", "processing"];
// El nombre exacto del campo de fecha no esta documentado: se prueban los habituales.
const STAMP_FIELDS = ["completed_at", "processed_at", "finished_at", "updated_at", "received_at", "created_at", "uploaded_at"];

const toMs = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v; // segundos o milisegundos
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
};

/** Marca de tiempo (ms) de una carga, o null si la API no la trae. */
export function uploadStamp(u) {
  for (const f of STAMP_FIELDS) {
    const t = toMs(u?.[f]);
    if (t != null) return t;
  }
  return null;
}

const detail = (u) =>
  (u.diagnostics || []).map((d) => `${d.code}${d.field ? `/${d.field}` : ""} x${d.rows_affected ?? "?"} (${d.severity || "?"})`).join(", ");

/**
 * Segun el Centro de Ayuda de OpenAI Ads los productos caducan a las 2 semanas sin renovarse: se avisa a
 * los 7 dias de la ultima carga procesada y se da error a los 12.
 *  - uploads: [{ feed_id, upload_id, status, rows_accepted, rows_rejected, rows_ads_eligible, diagnostics }]
 */
export function evaluateUploads(
  uploads,
  { feedId = null, expectedRows = null, expectedAdsEligible = null, now = Date.now(), warnAfterDays = 7, errorAfterDays = 12 } = {},
) {
  const errors = [];
  const warnings = [];
  let list = Array.isArray(uploads) ? uploads : [];
  if (feedId) list = list.filter((u) => u.feed_id === feedId);
  if (!list.length) {
    return { errors: [`OpenAI no muestra ninguna carga${feedId ? ` del feed ${feedId}` : ""}: el catalogo todavia no se importo`], warnings, resumen: null };
  }
  const stamped = list.filter((u) => uploadStamp(u) != null);
  const ordered = stamped.length === list.length ? [...list].sort((a, b) => uploadStamp(b) - uploadStamp(a)) : list;
  if (stamped.length !== list.length && list.length > 1) warnings.push("las cargas no traen fecha: se toma la primera de la lista como la mas reciente");
  const latest = ordered[0];

  if (latest.status === "failed") {
    errors.push(`la ultima carga ${latest.upload_id ?? ""} FALLO${detail(latest) ? `: ${detail(latest)}` : ""}`);
  } else if (latest.status === "skipped") {
    errors.push(`la ultima carga ${latest.upload_id ?? ""} fue OMITIDA (no se proceso)${detail(latest) ? `: ${detail(latest)}` : ""}`);
  } else if (UPLOAD_PENDING.includes(latest.status)) {
    warnings.push(`la ultima carga sigue en proceso (${latest.status})`);
  } else if (latest.status === "completed_with_errors") {
    (latest.rows_rejected > 0 ? errors : warnings).push(
      `la ultima carga termino con errores: ${latest.rows_rejected ?? 0} filas rechazadas${detail(latest) ? ` (${detail(latest)})` : ""}`,
    );
  } else if (latest.status === "completed") {
    if (latest.rows_rejected > 0) errors.push(`la ultima carga rechazo ${latest.rows_rejected} filas${detail(latest) ? ` (${detail(latest)})` : ""}`);
  } else {
    errors.push(`la ultima carga tiene un estado desconocido: ${latest.status}`);
  }

  if (UPLOAD_OK.includes(latest.status)) {
    if (expectedRows != null && latest.rows_accepted < expectedRows) errors.push(`OpenAI acepto ${latest.rows_accepted} de las ${expectedRows} filas del feed`);
    if (expectedAdsEligible != null && latest.rows_ads_eligible < expectedAdsEligible) {
      warnings.push(`solo ${latest.rows_ads_eligible} filas quedaron elegibles para anuncios; el feed marca ${expectedAdsEligible}`);
    }
  }

  // Frescura: la ultima carga PROCESADA con exito
  const lastGood = ordered.find((u) => UPLOAD_OK.includes(u.status) && uploadStamp(u) != null);
  let edadDias = null;
  if (lastGood) {
    edadDias = (now - uploadStamp(lastGood)) / 864e5;
    if (edadDias > errorAfterDays) errors.push(`la ultima carga procesada tiene ${edadDias.toFixed(1)} dias: los productos caducan a las 2 semanas sin renovarse`);
    else if (edadDias > warnAfterDays) warnings.push(`la ultima carga procesada tiene ${edadDias.toFixed(1)} dias: conviene renovarla (caducan a las 2 semanas)`);
  } else if (stamped.length) errors.push("ninguna carga termino con exito (completed)");
  else warnings.push("no se pudo calcular la edad de la ultima carga: la API no devolvio fechas");

  return {
    errors,
    warnings,
    resumen: {
      cargas: list.length,
      ultimoEstado: latest.status,
      filasAceptadas: latest.rows_accepted ?? null,
      filasRechazadas: latest.rows_rejected ?? null,
      filasElegibles: latest.rows_ads_eligible ?? null,
      edadUltimaCargaProcesadaDias: edadDias == null ? null : Number(edadDias.toFixed(1)),
    },
  };
}
