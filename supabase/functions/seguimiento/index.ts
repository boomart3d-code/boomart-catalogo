// Servicio de seguimiento de pedidos (proyecto "seguimiento web de pedidos
// de BoomArt", Etapa 3). Una sola Edge Function con dos caminos:
//
//   - GET  ?t=<token>   -> lectura PUBLICA, sin autenticacion (la usa la
//     pagina de boomart.pe). Devuelve UNICAMENTE los campos que el cliente
//     puede ver (etapa, avance por producto, metodo de envio, fecha de
//     actualizacion) -- nunca venta_id, nunca dinero, nunca la clave de
//     Shalom. Un token inventado y un token revocado dan la MISMA respuesta
//     (404 generico) a proposito, para no dar pistas.
//
//   - POST (header Authorization: Bearer <service_role key>) -> operaciones
//     de Boomart Studio: crear / actualizar_etapa / revocar / regenerar /
//     depurar_abandonados. Rechaza cualquier llamada sin esa clave exacta.
//
// Logica probada aparte con datos de prueba antes de escribir este archivo
// (ver seguimiento_logic.mjs / seguimiento_test.mjs, 11 casos, todos OK):
// reintentar "crear" nunca duplica, "regenerar" invalida el token viejo,
// "revocar" dos veces seguidas no rompe nada, "depurar" nunca toca filas
// activas.
//
// DESPLIEGUE: esta funcion necesita la verificacion automatica de JWT
// DESACTIVADA (para que el GET publico funcione sin sesion de nadie) --
// al crearla en el panel, destildar "Enforce JWT verification". La
// autenticacion del POST la hace esta misma funcion a mano, comparando el
// header Authorization contra la service_role key real.
//
// Secrets que necesita (Edge Functions > Secrets):
//   SB_SERVICE_ROLE_KEY -> la misma que ya usa Boomart Studio para "Clientes web"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const TABLE = "seguimiento_pedidos";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const ETAPAS_VALIDAS = new Set([
  "tomado", "fabricacion", "postproduccion", "pintado", "empaquetado",
  "listo_envio", "listo_recojo", "enviado_shalom", "cerrado",
]);

// CORS: el GET publico lo llama el navegador del cliente directo desde
// boomart.pe (o desde donde sea que se pruebe), asi que la respuesta
// necesita este header o el navegador la bloquea aunque el servidor haya
// respondido bien. No hay datos sensibles en juego (el GET publico ya
// filtra los campos seguros), asi que "*" es aceptable aca -- confirmado
// con una prueba real en el navegador (Etapa 5) que sin esto la pagina
// SIEMPRE mostraba "no disponible", incluso con un token valido.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function campoPublico(row: Record<string, unknown>) {
  return {
    etapa: row.etapa,
    productos: row.productos ?? [],
    metodo_envio: row.metodo_envio,
    actualizado_en: row.actualizado_en,
    // A pedido explicito de Adrian (2026-09-23): nombre del cliente y
    // direccion de envio (o agencia Shalom) SI se muestran. DNI, correo,
    // telefono y dinero (abonos/saldos) siguen sin exponerse -- Studio
    // nunca los manda en el payload de "crear"/"actualizar_etapa".
    nombre_cliente: row.nombre_cliente ?? "",
    direccion_envio: row.direccion_envio ?? "",
  };
}

function autorizado(req: Request): boolean {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && token === SERVICE_ROLE_KEY;
}

async function getActivoPorVenta(ventaId: number) {
  const { data } = await sb.from(TABLE).select("*")
    .eq("venta_id", ventaId).eq("activo", true).limit(1).maybeSingle();
  return data;
}

async function handleGetPublico(token: string) {
  if (!token) return json({ error: "Falta el parametro t." }, 400);
  const { data } = await sb.from(TABLE).select("*").eq("id", token).maybeSingle();
  if (!data || data.activo !== true) {
    return json({ disponible: false }, 404);
  }
  return json({ disponible: true, ...campoPublico(data) });
}

async function handleCrear(body: Record<string, unknown>) {
  const ventaId = Number(body.venta_id);
  if (!ventaId) return json({ error: "Falta venta_id." }, 400);
  const existente = await getActivoPorVenta(ventaId);
  if (existente) return json({ id: existente.id, creado: false });
  const { data, error } = await sb.from(TABLE).insert({
    venta_id: ventaId,
    etapa: body.etapa || "tomado",
    productos: body.productos || [],
    metodo_envio: body.metodo_envio || "local",
    nombre_cliente: body.nombre_cliente || "",
    direccion_envio: body.direccion_envio || "",
    activo: true,
  }).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ id: data.id, creado: true });
}

async function handleActualizarEtapa(body: Record<string, unknown>) {
  const ventaId = Number(body.venta_id);
  const etapa = String(body.etapa || "");
  if (!ventaId || !ETAPAS_VALIDAS.has(etapa)) {
    return json({ error: "venta_id o etapa invalidos." }, 400);
  }
  const existente = await getActivoPorVenta(ventaId);
  if (!existente) return json({ actualizado: false, razon: "sin_seguimiento_activo" });
  const { error } = await sb.from(TABLE).update({
    etapa,
    productos: body.productos ?? existente.productos,
    nombre_cliente: body.nombre_cliente ?? existente.nombre_cliente,
    direccion_envio: body.direccion_envio ?? existente.direccion_envio,
    actualizado_en: new Date().toISOString(),
  }).eq("id", existente.id);
  if (error) return json({ error: error.message }, 500);
  return json({ actualizado: true, id: existente.id });
}

async function handleRevocar(body: Record<string, unknown>) {
  const ventaId = Number(body.venta_id);
  if (!ventaId) return json({ error: "Falta venta_id." }, 400);
  const { data, error } = await sb.from(TABLE)
    .update({ activo: false, actualizado_en: new Date().toISOString() })
    .eq("venta_id", ventaId).eq("activo", true).select();
  if (error) return json({ error: error.message }, 500);
  return json({ revocados: (data || []).length });
}

async function handleRegenerar(body: Record<string, unknown>) {
  await handleRevocar(body);
  return handleCrear(body);
}

async function handleDepurar(body: Record<string, unknown>) {
  const dias = Number(body.dias || 30);
  const limite = new Date();
  limite.setDate(limite.getDate() - dias);
  const { data, error } = await sb.from(TABLE)
    .delete().eq("activo", false).lt("actualizado_en", limite.toISOString()).select();
  if (error) return json({ error: error.message }, 500);
  return json({ borrados: (data || []).length });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    // Preflight de CORS (el navegador lo manda solo antes de algunos
    // requests). Sin cuerpo, solo los headers de arriba.
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);

  if (req.method === "GET") {
    return handleGetPublico(url.searchParams.get("t") || "");
  }

  if (req.method === "POST") {
    if (!autorizado(req)) {
      return json({ error: "No autorizado." }, 401);
    }
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "JSON invalido." }, 400);
    }
    switch (body.accion) {
      case "crear":
        return handleCrear(body);
      case "actualizar_etapa":
        return handleActualizarEtapa(body);
      case "revocar":
        return handleRevocar(body);
      case "regenerar":
        return handleRegenerar(body);
      case "depurar_abandonados":
        return handleDepurar(body);
      default:
        return json({ error: "Accion desconocida." }, 400);
    }
  }

  return json({ error: "Metodo no soportado." }, 405);
});
