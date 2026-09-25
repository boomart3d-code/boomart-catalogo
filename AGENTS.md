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
