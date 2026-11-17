# Acceso a BoomArt Polos desde la portada

Codex, 17 de noviembre de 2026. Versión aprobada por Adrián para publicar mediante su indicación «publica». Implementación: `47ea1205`. El resultado del despliegue se registra en el relevo `BA-af2dae8c1150`.

- Worktree: `D:/BOOMART-ENTREGAS/web-universo-polos-20261117`.
- Rama: `codex/integracion-polos-portada-20261117`, basada en `origin/main` (`9330b3d4`).
- Reservas: preparación `BA-cde71bb5b57c`; publicación `BA-af2dae8c1150`.
- Vista previa: `http://127.0.0.1:4173/#boomart-polos`.

## Resultado

Acceso Polos visible en la cabecera, menú Explorar y pie. Una sección antes del catálogo conecta las dos líneas bajo «Tu universo. También se lleva puesto», con fotos existentes completas y accesos a Saint Seiya, Harry Potter y Dragon Ball. En la navegación dinámica del catálogo 3D, Saint Seiya, Harry Potter y Zelda enlazan a su colección de polos; Zelda usa la ruta real `legend-of-zelda`. Polos incorpora regreso a la tienda 3D en portada, menú y pie.

CSS acotado en `src/polos-bridge.css?v=1`. JavaScript de la portada incrementado a `boomart-v2.js?v=9`. No cambian catálogos, precios, pagos, carritos ni datos de clientes. Se conserva el checkout canónico con sus cambios ajenos.

## Verificación

- `node --test polos/catalogo-core.test.cjs`: 4/4.
- `node --check src/boomart-v2.js` y `git diff --check`: correctos.
- `node scripts/check-header-gap.mjs http://127.0.0.1:4173`: 18 combinaciones página/ancho, con hueco: 0.
- Navegador: anchos 320, 375, 390, 768 y 1280 px, sin desbordamiento horizontal observado; controles de navegación dentro del ancho disponible. Fotos con `object-fit: contain`.
- Enlaces comprobados: Saint Seiya (6 polos), Harry Potter (6), Dragon Ball (5) y Zelda (1), con colección seleccionada; regreso a portada 3D correcto. Sin errores de consola observados al terminar.
- Capturas: `D:/BOOMART-ENTREGAS/integracion-polos-20261117/vista-escritorio.jpg` y `vista-movil.jpg`.

## Siguiente paso

Publicación autorizada. Fetch previo sin cambios remotos posteriores a `9330b3d4`. Enviar el candidato aprobado a `main`, comprobar GitHub Pages y los accesos en producción; registrar SHA y resultado en el relevo de publicación. No incluir cambios locales del checkout canónico.
