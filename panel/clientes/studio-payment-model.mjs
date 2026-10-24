export function studioPaymentView(order) {
  const labels = {pagado:"Pago completo en Studio",abono_parcial:"Abono registrado en Studio",
    sin_abono:"Venta registrada · sin abono",sin_validar:"Pendiente de validar en Studio",
    sincronizando:"Esperando sincronización de Studio",ambiguo:"Vínculo de venta por revisar",
    revisar:"Importes por revisar en Studio",descartado:"Pedido descartado en Studio"};
  const financial = ["pagado","abono_parcial","sin_abono"].includes(order.pago);
  return {label:labels[order.pago] || "Estado no disponible",financial,
    paid:financial && Number(order.abonado)>0,
    note:order.pago==="sin_validar" ? "Valida el pedido en Studio; el estado aparecerá aquí automáticamente."
      : order.pago==="sincronizando" ? "Abre Studio y espera a que termine de sincronizar."
      : order.pago==="ambiguo" ? "Hay vínculos contradictorios. Revisa el pedido en Studio."
      : ""};
}
