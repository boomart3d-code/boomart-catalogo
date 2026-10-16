# Pago confirmado y medición de ventas

Pedido de Adrián, 16/10/2026. Panel: https://boomart.pe/panel/clientes/

## Uso

1. Verificar el abono directamente en la cuenta de BoomArt y registrar el pedido en Studio.
2. En la ficha del cliente completo, abrir **Pago confirmado**.
3. Copiar el número de pedido/nota de Studio. Debe ser siempre el mismo para esa venta.
4. Elegir productos del catálogo, cantidades y precios finales por unidad (después del descuento). El total se calcula; no incluir flete.
5. Escribir abono verificado, medio y referencia. Marcar la casilla y confirmar.

La compra se mide una vez por el **total de los productos**, al aceptar su primer abono. Los pagos siguientes del saldo pertenecen al mismo pedido y solo se registran en Studio. Este panel no crea tickets, no modifica Studio, no verifica vouchers ni consulta bancos. Tampoco crea anuncios ni modifica presupuestos.

El historial diferencia confirmación guardada, pendiente de envío, enviada, error y vencida. Un error de red se reintenta con **Reintentar envío**; el número del pedido y el `event_id` no cambian. Un doble clic devuelve el mismo registro. Cambiar los datos de un pedido ya confirmado provoca un conflicto visible en lugar de sobreescribirlo.

## Activación pendiente

La primera publicación queda **sin envío a Meta**, porque falta su credencial privada en Supabase. Guardar una confirmación funciona y la pantalla lo explica. No afirmar que Meta recibió la compra mientras su estado no sea `enviado`.

Configurar únicamente en los secretos del proyecto Supabase `sasqusmvysbvqiggdmuj`:

- `META_CAPI_ACCESS_TOKEN`: credencial autorizada para enviar eventos al píxel **2940378396299063**.
- `META_GRAPH_VERSION`: versión admitida por Meta en el momento de activación, explícita (formato `vNN.0`).

No pegar la credencial en el chat, HTML, JavaScript público, Git ni registros. No reutilizar ni sobrescribir otros secretos del proyecto. La función lee estos valores del servidor y comprueba su existencia. Tras configurarlos, verificar con un evento de prueba o una venta verdadera que el administrador haya confirmado; nunca crear compras ficticias de producción. Confirmaciones de más de siete días no se envían.

## Protección y transporte

- `meta_compras_confirmadas`: tabla privada con RLS forzado. El navegador no tiene acceso directo.
- `meta_compra_confirmar`: RPC solo para la cuenta administradora, con sesión autenticada y `auth.uid()`; cliente completo, validación de montos, cantidades y referencia.
- Número de pedido normalizado a mayúsculas y alfanuméricos, único en toda la tabla. Un candado transaccional serializa confirmaciones concurrentes.
- El registro guarda productos, total, abono, medio, referencia, autor y fecha. Correo/teléfono se normalizan y convierten a SHA-256 antes de guardar; no copia DNI, nombre, dirección ni fotos de pago.
- Al depurar un perfil, el enlace al perfil pasa a nulo; la confirmación y la deduplicación sobreviven.
- `meta-purchase`: función de servidor con JWT validado mediante `auth.getUser()`. El ID de píxel es fijo. No usa IP, navegador ni cookies del administrador como datos del comprador.
- Payload `Purchase`, `action_source: chat`, moneda PEN, total de productos y `content_ids` del catálogo. Identificador estable `boomart_purchase_<uuid>` en cada reintento.
- Un lease de dos minutos impide POST simultáneos; timeout de 15 segundos; máximo 20 intentos. Se informa `enviado` solo si Meta devuelve `events_received: 1` y se guarda el acuse. Los errores del proveedor se reducen a códigos, sin respuestas completas ni tokens.
- Reintentos manuales desde el historial. No hay tareas de envío programadas ni suscripciones nuevas.

## Publicación

1. Aplicar `supabase/migrations/202610160001_pagos_confirmados_meta.sql` al proyecto `boomart` (migración aditiva, no cambia ventas ni clientes existentes).
2. Desplegar solo `meta-purchase` con `--project-ref sasqusmvysbvqiggdmuj --no-verify-jwt --use-api`. La verificación JWT se hace dentro de la función para admitir sesiones de Supabase modernas.
3. Publicar el panel con `styles.css?v=3`, `app.js?v=3`, `payments.js?v=1` y `payments-model.mjs?v=1`.
4. Verificar RPC anónima denegada, CORS, tabla vacía y archivos públicos desplegados.

## Verificación

- `node --test scripts/test-confirmed-payments.mjs`: siete pruebas de dinero exacto, validaciones, payload, credencial ausente, concurrencia de transporte, errores de Meta y fallo al guardar el acuse. Fetch simulado: nunca llama a Meta.
- `supabase/tests/meta_compras.test.sql`: solo base descartable llamada `meta_purchase_test`; comprueba permisos, validaciones, deduplicación, hashes, lease, reintentos y conservación tras depuración.
- `supabase/tests/meta_compras.concurrent.sql`: dos conexiones PostgreSQL simultáneas devuelven el mismo UUID del pedido y dejan una sola confirmación.
- `node scripts/payments-qa-server.mjs`: formulario real con cliente ficticio local, sin credenciales, Supabase ni Meta; comprueba confirmación, historial, reapertura y tamaño móvil de 390 px.

Referencia del formato y normalización: [SDK oficial de Meta](https://github.com/facebook/facebook-nodejs-business-sdk/tree/main/src/objects/serverside).
