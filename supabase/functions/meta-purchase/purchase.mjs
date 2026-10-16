// Puro e inyectable: las pruebas nunca llaman a Meta ni usan credenciales reales.
export function purchasePayload(order) {
  return {data: [{
    event_name: "Purchase",
    event_time: Math.floor(new Date(order.confirmado_en).getTime() / 1000),
    event_id: `boomart_purchase_${order.id}`,
    action_source: "chat",
    user_data: {em: [order.email_hash], ph: [order.phone_hash]},
    custom_data: {
      currency: "PEN", value: Number(order.total), order_id: order.pedido,
      content_type: "product", content_ids: order.productos.map(p => p.id),
      contents: order.productos,
      num_items: order.productos.reduce((n, p) => n + p.quantity, 0),
    },
  }]};
}

export async function deliverPurchase({db, id, token, version, fetcher = fetch}) {
  if (!token || !version) return {status: "sin_configurar"};
  const {data, error} = await db.rpc("meta_compra_tomar", {p_id: id});
  if (error) throw new Error("No se pudo preparar el envío");
  const order = data?.[0];
  if (!order) return {status: "sin_cambios"};
  let ok = false;
  let code = "META_NETWORK";
  try {
    const res = await fetcher(`https://graph.facebook.com/${version}/2940378396299063/events`, {
      method: "POST",
      headers: {"Content-Type": "application/json", Authorization: `Bearer ${token}`},
      body: JSON.stringify(purchasePayload(order)),
      signal: AbortSignal.timeout(15000),
    });
    const result = await res.json();
    ok = res.ok && result.events_received === 1 && !result.error;
    code = `META_${res.status}_${Number(result.error?.code) || 0}`;
  } catch { /* Código corto: no guardar la respuesta ni secretos del proveedor. */ }
  const saved = await db.rpc("meta_compra_resultado", {
    p_id: order.id, p_lease: order.lease, p_ok: ok, p_error: ok ? null : code,
  });
  if (saved.error || saved.data !== true) throw new Error("Envío pendiente de verificar. Reintenta con el mismo pedido.");
  return {status: ok ? "enviado" : "error"};
}
