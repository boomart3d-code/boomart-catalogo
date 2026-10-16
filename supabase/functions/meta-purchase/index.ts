import {createClient} from "https://esm.sh/@supabase/supabase-js@2.117.3";
import {deliverPurchase} from "./purchase.mjs";

const allowed = new Set(["https://boomart.pe", "https://www.boomart.pe"]);
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(url, serviceKey, {auth: {persistSession: false, autoRefreshToken: false}});
const token = Deno.env.get("META_CAPI_ACCESS_TOKEN");
// Se fija explícitamente al activar para no depender de una versión implícita.
const version = Deno.env.get("META_GRAPH_VERSION");
const configured = Boolean(token && version && /^v\d+\.0$/.test(version));

Deno.serve(async req => {
  const origin = req.headers.get("origin") || "";
  const headers = {"Access-Control-Allow-Origin": allowed.has(origin) ? origin : "https://boomart.pe",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Cache-Control": "no-store", "Vary": "Origin", "Content-Type": "application/json"};
  const json = (body: object, status = 200) => new Response(JSON.stringify(body), {status, headers});
  if (!allowed.has(origin)) return json({error: "Origen no permitido"}, 403);
  if (req.method === "OPTIONS") return new Response(null, {status: 204, headers});
  if (!["GET","POST"].includes(req.method)) return json({error: "Método no permitido"},405);
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({error:"Sesión requerida"},401);
  const auth = await db.auth.getUser(authorization.slice(7));
  if (auth.error || !auth.data.user || auth.data.user.email?.toLowerCase() !== "boomart.3d@gmail.com") {
    return json({error:"No autorizado"},403);
  }
  if (req.method === "GET") return json({configured});
  try {
    const raw = await req.text();
    if (raw.length > 200) return json({error:"Solicitud demasiado grande"},413);
    let body;
    try {body = JSON.parse(raw);} catch {return json({error:"JSON no válido"},400);}
    const id = body?.id;
    if (typeof id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
      return json({error:"Confirmación no válida"},400);
    }
    return json(await deliverPurchase({db,id,token: configured ? token : null,version}));
  } catch {
    return json({error:"No se pudo completar el envío. La confirmación queda guardada; reintenta con el mismo pedido."},500);
  }
});
