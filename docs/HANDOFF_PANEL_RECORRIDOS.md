# Detalle de recorridos — 24/10/2026 · Codex

Estado: implementado y probado localmente; NO desplegado. Adrián autorizó
la mejora en esta conversación. No se consultaron ni modificaron pedidos reales.

El panel incorpora carritos y salidas a WhatsApp (100 sesiones del rango y
filtro), con carga diferida de la cronología. Incluye fuente, medio, campaña,
referente, entrada, ubicación aproximada, dispositivo, idioma y eventos.
No identifica personas por nombre ni une visitas anónimas a clientes.
Los nuevos eventos de pedido incluyen código W-, cupón aplicado, método y
hasta 20 líneas de productos/variantes/cantidades sin contactos ni documentos.
El código y contenido exacto no pueden reconstruirse para eventos antiguos.
No se interpreta un clic como mensaje enviado, pago o venta confirmada.

## Activación pendiente

1. Iniciar sesión en Supabase (sesión del navegador cerrada; acceso GitHub
   también solicita login). No se obtuvieron ni guardaron credenciales.
2. Aplicar SOLO `supabase/migrations/202610240001_panel_recorridos.sql`.
   No ejecutar migraciones ajenas en lote. Reutiliza admin y funciones geo
   existentes. No toca filas ni permisos de tablas. Acceso RPC solo autenticado
   con comprobación interna del administrador existente.
3. Desplegar `supabase/functions/track/index.ts`, manteniendo JWT desactivado
   como el recolector público actual. Conserva límites, geo y filtros previos.
4. Verificar RPC (rechazo anónimo/no administrador y lectura administrativa).
5. Publicar commit web a origin/main y verificar en panel autenticado.
   Después se puede inspeccionar la compra reciente, sin garantizar recuperar
   información que nunca se registró. No afirmar que se desplegó antes de esto.

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
