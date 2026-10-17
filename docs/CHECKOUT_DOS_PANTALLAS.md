# Pedido en dos pantallas

Aprobado por Adrián el 17 de octubre de 2026. Se simplifica la interfaz, no los requisitos operativos.

1. **Datos del pedido**: contacto (nombre, WhatsApp y correo), documento obligatorio para identificar al cliente y preparar el comprobante, modalidad de entrega. Dirección local, agencia Shalom o información de recojo aparecen solo al elegir la modalidad correspondiente. Dirección y agencia conservan la opción vigente de coordinación posterior por WhatsApp.
2. **Resumen y pago**: productos, total, cupón cuando corresponda, importe a pagar y saldo, datos de contacto y entrega, métodos de pago y enlace a WhatsApp. Se puede volver a editar sin repetir los datos ya escritos.

La pantalla final es una confirmación del paso a WhatsApp, no un tercer paso de compra ni confirmación del pago. Se conserva la validación manual del abono.

## Condiciones conservadas

- Nombre, teléfono, correo y documento siguen siendo obligatorios. El servidor y sus validaciones no se modifican.
- No se añade contraseña ni confirmación obligatoria de correo para comprar.
- Reserva del 50 % o pago total; cupón disponible solo en los medios ya autorizados, no en tarjeta.
- El resumen se recalcula junto con el método y la modalidad de pago para evitar mostrar un total distinto del importe utilizado por WhatsApp.
- Registros, correos, cupón, creación de pedido por validar y sincronización con Studio conservan sus contratos actuales. No se ejecutan migraciones ni se modifican ventas, clientes o abonos históricos.
- Los datos de entrega se muestran como texto escapado. El resumen no incluye el número de documento; puede revisarse en «Editar datos y entrega».

## Verificación

- `node --test scripts/test-checkout-two-steps.mjs scripts/test-confirmed-payments.mjs`
- `node scripts/test-official-prices.mjs`
- Prueba de interfaz aislada: `node scripts/serve-checkout-test.mjs`. El servidor solo escucha en 127.0.0.1, usa datos ficticios, intercepta Supabase y WhatsApp y bloquea conexiones externas. No genera registros, pedidos, correos ni conversiones reales.
- Escenarios locales: `/` (nuevo), `/?scenario=saved` (datos guardados), `/?scenario=error` (primer guardado falla), `/?scenario=unavailable` (sin registro disponible).
