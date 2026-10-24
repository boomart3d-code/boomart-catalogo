# Detalle de recorridos — 24/10/2026 · Codex

Estado: DESPLEGADO el 24/10/2026 por Codex, autorizado por Adrián.
Se verificó el recorrido real en lectura desde el panel administrativo.
No se modificaron filas de pedidos, clientes ni eventos.

El panel incorpora carritos y salidas a WhatsApp (100 sesiones del rango y
filtro), con carga diferida de la cronología. Incluye fuente, medio, campaña,
referente, entrada, ubicación aproximada, dispositivo, idioma y eventos.
No identifica personas por nombre ni une visitas anónimas a clientes.
Los nuevos eventos de pedido incluyen código W-, cupón aplicado, método y
hasta 20 líneas de productos/variantes/cantidades sin contactos ni documentos.
El código y contenido exacto no pueden reconstruirse para eventos antiguos.
No se interpreta un clic como mensaje enviado, pago o venta confirmada.

## Activación verificada

- Migración individual aplicada con éxito en el proyecto existente.
- Recolector `track` actualizado en el editor oficial tras comparar su versión
  remota con la local: solo cambió el tratamiento del contenido del carrito.
- JWT del recolector sigue desactivado como antes; no se modificó ese ajuste.
- RPC: administrador devuelve recorridos y rol anónimo sin EXECUTE; petición
  HTTP anónima rechazada con 401/42501.
- Commit funcional `2f4ddf1b` enviado a origin/main; GitHub Pages run
  `40106266283` finalizó con success. Panel publicado, módulo disponible y
  desplegable administrativo con cronología y nombres de productos verificado.
- Hallazgo para Adrián comunicado en el chat; no guardar datos operativos
  de clientes en esta documentación ni en la memoria compartida.
- Ajuste de rótulos: la fecha de la cabecera significa última actividad, y el
  embudo describe el clic hacia WhatsApp sin afirmar que el mensaje se envió.

Rollback: revertir commit frontend; la función RPC adicional no interfiere con
el panel previo y puede dejarse sin uso. No borrar eventos.

## Validación

- `node scripts/test-panel-recorridos.cjs`: PostgreSQL embebido PGlite en memoria,
  fixtures ficticios; permisos, filtros Perú/mundo, sesión que empezó antes del
  rango, códigos, cronología, escape HTML y carga diferida aprobados.
- Dependencia de QA aislada fuera del checkout:
  `npm install --prefix D:/BOOMART-EQUIPO/tmp/qa-recorridos @electric-sql/pglite`.
- `node --test scripts/test-checkout-two-steps.mjs`: 6/6.
- `node --test scripts/test-confirmed-payments.mjs`: 7/7.
- Sintaxis JS y `git diff --check` aprobados.
- Desplegable revisado en Chrome con fixture local ficticio. Captura en
  `D:/BOOMART-EQUIPO/tmp/qa-recorridos/vista-panel.png` (no versionada).

## Simplificación solicitada por Adrián (24/10/2026)

Sustituido el registro técnico por resumen con productos, total, cantidad,
cupón, método elegido, código cuando existe, procedencia, campaña si existe,
ubicación aproximada y equipo. Cronología limitada a entrada, primer agregado,
inicio de compra y salida a WhatsApp. Omite filtros, rutas, idioma, zona horaria,
referente crudo y navegación posterior al pedido. Productos históricos se
rotulan como agregados, sin fingir que son el contenido definitivo del pedido.
Sin cambios a BD ni a tracking. JS/CSS versionados para renovar caché.
Prueba de resumen/escape y regresión PostgreSQL embebida aprobada. La conexión
al navegador no respondió al intentar la revisión visual de este ajuste.

## Intereses previos al pedido (24/10/2026)

Añadido listado de otros productos consultados antes de la salida a WhatsApp,
sin horas ni repeticiones, conservando orden de primera consulta. Omite productos
del snapshot del pedido (o agregados históricos cuando no hay snapshot), y vistas
posteriores. Solo presenta intereses observados en la sesión; no crea audiencias
ni envía mensajes de remarketing. Sin cambios de datos, RPC ni permisos.
