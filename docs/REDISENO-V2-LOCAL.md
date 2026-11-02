# BoomArt V2 — vista previa local

Estado: implementación local para revisión de Adrián. Sin push ni despliegue. URL: http://localhost:4183/.

## Resultado

- Portada editorial adaptable con tres mundos: Saint Seiya, Navidad y Zelda; controles de pausa y selección manual. Respeta la preferencia de movimiento reducido.
- Directorio de diez colecciones y selecciones breves de Saint Seiya, Navidad y Zelda. Entrar en una categoría muestra su catálogo; «Todos» abre el catálogo conjunto.
- Cabeceras temáticas, búsqueda contextual, filtros de tipo en Saint Seiya y orden por precio.
- Cabecera compacta con logo oficial, buscador, categorías, cuenta y carrito. Modal de producto conserva las imágenes completas, variantes y carrito.
- Segunda fotografía solicitada al apuntar con ratón o enfocar con teclado. Las páginas que no cargan V2 conservan la carga diferida anterior.
- Audio optativo de Saint Seiya y Zelda. Fuentes y alcance en `assets/audio/README.md`.
- Santa y escudo de Zelda calados con transparencia real, tanto en portada como en cabecera de colección. Fondos decorativos SVG ligeros: pino/luces cálidas y bosque/geometría dorada. Atena conserva su imagen calada y fondo cósmico.

## Archivos y fuentes

Implementación: `index.html`, `src/app.js`, `src/boomart-v2.js`, `src/boomart-v2.css` y nuevos assets de `assets/hero/` y `assets/audio/`.

Los dos nuevos calados se generaron a partir de `assets/products/tazon-de-galletas-santa-hero-v2.webp` y `assets/products/escudo-zelda-hero.webp`, se revisaron visualmente y se convirtieron a WebP con alfa. Los PNG originales generados permanecen en `C:/Users/osore/.codex/generated_images/01a195d2-e8b0-7451-8144-c2fb9fbc6e20/`, archivos `exec-9fc50d5b-53d1-4458-a2ef-a2e6b03a8053.png` y `exec-7c3d9512-f4b3-4b98-a3b9-53dc54147e0f.png`.

No se modificaron datos de producto, precios, Studio ni el checkout canónico. Worktree: `D:/BOOMART-ENTREGAS/propuesta-colecciones-20261102`, rama `codex/propuesta-colecciones-20261102`.

## Validación realizada

- Sintaxis JavaScript y comprobación de whitespace Git.
- Revisión de anchos 320, 360, 390, 414, 430 y 1280 px: documento sin desbordamiento horizontal; Saint Seiya con 39 piezas. Evidencia: `D:/BOOMART-ENTREGAS/auditoria-redisenio-20261102/verificacion-v2.json` (antes del último ajuste de calados/decoraciones, sin cambio estructural).
- Inicio: 42 elementos img frente a 105 de V1; esto mide elementos, no una reducción equivalente en bytes o tiempos. Sin solicitudes iniciales de fotografías alternativas ni audio en esa comprobación.
- Interacción real en navegador: selección de categoría, filtro Cascos y tiaras (3 piezas), modal, añadir/quitar una pieza del carrito local y activar/pausar audio. No se creó ni envió un pedido.
- Inspección visual final de Santa y Zelda en portada y cabeceras. WebP RGBA de 330938 y 222928 bytes; alfa 0–255 confirmado.
- Capturas en la carpeta de auditoría: `portada-navidad-calada-v2.png` y `portada-zelda-calado-v2.png`.

## Pendiente antes de producción

Revisión de Adrián, prueba física en Android/iPhone (los tamaños emulados no equivalen a Safari iOS), selección definitiva del audio y aprobación de publicación. Revisar integración de las páginas estáticas de categoría y SEO con esta nueva composición al preparar el despliegue. El servidor local queda abierto para revisar.
