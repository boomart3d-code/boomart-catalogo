export function moneyCents(value) {
  const text = String(value).trim();
  if (!/^\d{1,6}([.,]\d{1,2})?$/.test(text)) throw new Error("Usa un monto válido: 100 o 100,50.");
  const [whole, decimals = ""] = text.replace(",", ".").split(".");
  return Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
}

export function validatePayment({pedido, productos, abonado, medio, referencia, verified}, catalogIds) {
  if (!verified) throw new Error("Verifica primero el abono en tu cuenta.");
  if (!/^[A-Z0-9]{3,60}$/.test(pedido.toUpperCase().replace(/[^A-Z0-9]/g, ""))) {
    throw new Error("Escribe el número de pedido de Studio.");
  }
  if (!Array.isArray(productos) || productos.length < 1 || productos.length > 50) throw new Error("Añade los productos vendidos.");
  const seen = new Set();
  let total = 0;
  const items = productos.map(p => {
    if (!catalogIds.has(p.id)) throw new Error("Elige un producto del catálogo oficial.");
    if (seen.has(p.id)) throw new Error("Agrupa las unidades del mismo producto en una sola línea.");
    seen.add(p.id);
    if (!/^[1-9]\d{0,2}$/.test(String(p.quantity))) throw new Error("La cantidad debe estar entre 1 y 999.");
    const price = moneyCents(p.item_price);
    if (price <= 0) throw new Error("El precio debe ser mayor que cero.");
    total += price * Number(p.quantity);
    return {id: p.id, quantity: Number(p.quantity), item_price: price / 100};
  });
  const paid = moneyCents(abonado);
  if (total > 10000000 || paid <= 0 || paid > total) throw new Error("El abono debe ser mayor que cero y no superar el total.");
  if (!["yape","plin","interbank","bcp","efectivo","otro"].includes(medio)) throw new Error("Selecciona el medio de pago.");
  if (referencia.trim().length < 3 || referencia.trim().length > 100) throw new Error("Escribe una referencia del abono (3 a 100 caracteres).");
  return {p_pedido: pedido.trim(), p_productos: items, p_abonado: paid / 100, p_medio: medio, p_referencia: referencia.trim()};
}
