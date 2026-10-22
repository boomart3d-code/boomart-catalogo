# AGENTS.md — boomart.pe

Reglas operativas permanentes para cualquier agente (Claude Code, Codex, u
otro) que trabaje en este repositorio. Leer esto ANTES de tocar código. Las
decisiones de negocio compartidas con Studio (qué se puede mostrar en el
enlace público, reglas de envío, etc.) viven en `DECISIONS.md` del repo de
Studio (`BoomArtCotizador/DECISIONS.md`) — este proyecto las hereda, no las
duplica. El trabajo activo del momento vive en `HANDOFF.md` del repo de
Studio (es un tablero compartido entre los dos proyectos).

## Antes de empezar cualquier sesión

1. `git pull` en este repo.
2. Leer `HANDOFF.md` en el repo de Studio para ver si hay algo activo que
   afecte a boomart.pe (por ejemplo, cambios en el enlace de seguimiento que
   ambos repos comparten).

## Reglas de proceso

- **SIEMPRE** confirmar entendimiento + un plan breve con Adrián y esperar su
  aprobación explícita antes de tocar código.
- Git **ya es** el canal real aquí — commits chicos y descriptivos, push a
  `origin/main`. GitHub Pages publica automáticamente al hacer push a `main`,
  no hay paso de despliegue aparte.
- Tras cambiar `data/products.json` o `data/reviews.json`, ejecutar siempre
  `node scripts/build-ai-catalog.mjs` y subir junto con el cambio los
  archivos regenerados (catálogo HTML/JSON, archivos para IA, feeds,
  sitemap, páginas de producto/categoría).
- Si se cambia un JS/CSS referenciado desde HTML con caché busting (`?v=N`),
  subir también la versión incrementada para evitar que el navegador del
  cliente sirva la copia vieja en caché.
- El panel de administración del sitio está roto — no se usa. Los cambios al
  catálogo se hacen editando `products.json` directamente a pedido de
  Adrián, en lenguaje natural.
- **Cambio simple** (texto/precio suelto/visual/catálogo puntual): directo
  a producción (commit + push), rápido y con validación mínima. Nunca debería
  consumir buena parte de la ventana de contexto de Adrián.
- **Cambio grande** (checkout, cuentas, pagos, estructura del sitio, o algo
  que requiera revisión extensa): antes de arrancarlo, avisarle a Adrián
  explícitamente que es grande/delicado y que va a tomar tiempo, y esperar
  su autorización antes de empezar — no arrancarlo solo porque "parece
  delicado" (pedido explícito de Adrián, 2026-09-29; ver bitácora).

## El enlace público de seguimiento (`/seguimiento/`)

Este repo contiene el frontend (`src/seguimiento.js`, `seguimiento/index.html`)
del mismo sistema de seguimiento que alimenta Studio vía Supabase. Antes de
cambiar qué datos se piden o se muestran ahí, revisar
`BoomArtCotizador/DECISIONS.md` (sección "Enlace público de seguimiento") —
nunca se debe exponer costo interno, utilidad, DNI, correo, teléfono, datos
de otros clientes ni credenciales.

## Privacidad y seguridad

- Nunca un monto de envío/flete visible públicamente (ni en el catálogo, ni
  en structured data, ni en el enlace de seguimiento).
- Las credenciales de Supabase (Edge Functions, service role key) viven en la
  configuración del proyecto Supabase, nunca en un archivo versionado en este
  repo — verificado que no hay ninguno trackeado hoy (2026-09-24).

## Logo oficial de BoomArt — regla estricta

- Antes de crear o modificar cualquier pieza visual, leer y aplicar
  `docs/IDENTIDAD_VISUAL_BOOMART.md`. La web es la referencia viva y el resto
  de materiales debe sentirse parte del mismo sistema, no solo llevar un logo.
- El logo oficial es el bloque vertical **BOOM / ART** ya guardado en
  `assets/boomart-logo-1.png`, `assets/boomart-logo-2.png`,
  `assets/boomart-logo-3.png` y `assets/boomart-logo.svg`. Nunca inventar,
  reinterpretar, redibujar con IA ni sustituirlo por letras, infinito u otro
  símbolo parecido.
- El isotipo oficial para favicon y app es la bomba circular **BA** entregada
  por Adrián el 14/10/2026 y conservada en `assets/brand/`. Sus versiones
  derivadas solo pueden cambiar fondo, transparencia, tamaño o formato; nunca
  la geometría, proporciones ni composición.
- Si hace falta un formato adicional, derivarlo mecánicamente desde esos
  originales. Si la aplicación exige cambiar el dibujo, detenerse y pedir la
  aprobación expresa de Adrián.

## Antes de publicar cambios en las plantillas de ficha/categoría
- Sirve el repo (`python -m http.server 4173`) y corre `node scripts/check-mobile-overflow.mjs`. Debe decir «con problema: 0». Detecta páginas que se salen del ancho del celular (obliga a pellizcar). Causa típica: columnas `1fr` en grillas con filas de miniaturas; usar `minmax(0,1fr)` y `min-width:0`.
- Tras tocar `src/styles.css` o la cabecera: `node scripts/check-header-gap.mjs` (con el servidor en 4173). Debe decir «con hueco: 0». La cabecera `.site-header` solo se baja 46px (`--quicknav-h`) en las páginas que traen la barra `.quick-nav` (regla `html:has(.quick-nav)`); si no, dejaba un hueco por donde se veía pasar el título de la página (visto en /impresion-3d-personalizada/, nosotros, politicas, etc.).
