# Pagos reflejados desde Studio · 24/10/2026 · Codex

Pedido de Adrián: no volver a introducir NV, productos, importes y referencia
en el portal cuando ya registró la venta y el abono en Studio.

## Implementación

- Consulta privada `panel_pagos_desde_studio(uuid[])` une el cliente web a sus
  pedidos y estos a `ventas_studio` por W- o NV persistida por Studio.
- No asocia ventas por nombre, teléfono, proximidad temporal o venta más reciente.
  Vínculos contradictorios/duplicados no se presentan como pago confirmado.
- El portal muestra total/abonado/saldo, NV automática y fecha de sincronización.
  Parcial y pago completo son distintos. Importes inconsistentes/anulación se
  señalan para revisar. No se cambia contabilidad, clientes, pedidos ni ventas.
- Se retira el formulario manual de confirmación y su botón. Studio sigue siendo
  el lugar donde registrar/corregir abonos. Se conserva historial Meta previo y
  reintento explícito de esos envíos; NO se crean nuevas conversiones Meta ni se
  activa publicidad automáticamente con este cambio.
- Depende de la sincronización ya existente de Studio: si no ha subido la venta,
  indica pendiente de sincronización. La consulta no hace que Studio sincronice.
- Árbol anterior recuperable desde `cd22398f`; migración solo añade una función.
  Revertir frontend es suficiente para volver al formulario anterior.

## Evidencia

- PostgreSQL embebido en memoria, datos ficticios:
  `node scripts/test-studio-payment-link.cjs` aprobado. Cubre pagos parciales y
  completos, ausencia de abono, inconsistencia, anulación/eliminación,
  contradicción de ambos extremos y dos pedidos reclamando misma NV, permisos.
- `node --test scripts/test-confirmed-payments.mjs`: 7/7. Sintaxis/diff correctos.
- Revisión independiente de subagente: dos hallazgos corregidos y cierre aprobado
  (conservar extremos contradictorios al contar; limpiar todos los bloques UI).
- Fixture local en Chrome aprobado: al actualizar hay 1 bloque de Studio,
  1 historial Meta anterior y ningún formulario de pago.
- Migración individual aplicada con éxito en Supabase; lectura del pedido
  solicitado por Adrián, sin modificar datos operativos. No guardar sus datos aquí.

## Activación

Publicar el frontend tras verificar RPC administrativa y acceso anónimo denegado.
Verificar tarjeta del pedido desde portal autenticado. No confundir la lectura
del estado de Studio con un nuevo registro de abono ni con conversión Meta.
