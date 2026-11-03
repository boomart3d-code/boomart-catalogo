# BoomArt V2 — vista previa local

Estado: implementación local para revisión de Adrián. Sin push ni despliegue. URL: http://localhost:4183/.

## Resultado

- Portada editorial adaptable con seis mundos: Saint Seiya, Navidad, Zelda, Cosplay, Soportes de mandos y Harry Potter (Fawkes); controles de pausa y selección manual. Respeta la preferencia de movimiento reducido.
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

## Ampliación de portada y tarjetas — 2 de noviembre de 2026

Solicitud de Adrián: incorporar Cosplay y Soportes de mandos al carrusel; añadir también Harry Potter con Fawkes, y unificar el fondo/encuadre de las diez tarjetas de categoría.

- Todas las tarjetas usan ahora imágenes con transparencia, fondo marfil común, iluminación suave y sombra de apoyo, con productos completos. Se revisaron las diez imágenes y su canal alfa; no se usa `cover` para llenar el espacio recortando el producto.
- Dos columnas en móvil, tres entre 701 y 1100 px, cinco en escritorio. La tarjeta de Marvel muestra el recorte existente del Doctor Doom; Cosplay, el Mandaloriano; Soportes, Picoro; Harry Potter, Fawkes.
- Cosplay sustituye el rótulo de Halloween en esta interfaz. Se conservan los identificadores, las pertenencias de catálogo y los enlaces existentes; no es una migración de nombres en Studio o en datos de producto. Los nombres individuales de producto mantienen su texto original.
- Los destacados de Cosplay empiezan por cascos/máscaras; los de Soportes, por Picoro, Deadpool, Wolverine y Majin Buu. La ordenación por precio sigue disponible.
- Ambientes de portada y cabecera: ciencia ficción sobria para Cosplay, verde/menta y geometría de videojuegos para Soportes, ámbar y constelaciones para Fawkes. Nuevos SVG: `assets/hero/cosplay-atmosphere-v3.svg`, `gaming-atmosphere-v3.svg`, `magic-atmosphere-v3.svg`.
- Soportes indica que el mando de referencia no está incluido.

### Imagen editada

Herramienta: `image_gen` integrada, modo de edición con transparencia. Se reutilizaron los otros calados existentes. Un intento inicial de limpieza de Wolverine/Picoro no produjo archivos utilizables; Wolverine no se incorporó. La limpieza individual de Picoro sí se generó y fue revisada visualmente.

Origen: `assets/hero/tile-soportes-mandos.webp`.
Resultado incorporado: `assets/hero/soporte-picoro-cutout-v3.webp` (149136 bytes, RGBA, alfa 0–255).
PNG original conservado: `C:/Users/osore/.codex/generated_images/01a195d2-e8b0-7451-8144-c2fb9fbc6e20/exec-fe09b7cb-73a1-4a04-a9f7-49a29630157b.png`.

Instrucción utilizada: «Edit this product photograph into a clean transparent cutout. Keep the entire green sculptural hand controller stand, pink arm detailing, blue base and white controller exactly as photographed. Remove the small dark rectangular piece of old tabletop at the lower right of the blue base and all residual background pixels. Preserve the object's shape, colors, texture, controller and all parts. Center the complete object with a small transparent margin. Background must be true alpha transparency.»

### Verificación de esta ampliación

- `node --check` en ambos JS y `git diff --check`.
- 320, 390, 430, 768 y 1280 px: seis controles y diez tarjetas, sin desbordamiento horizontal. Ajuste final de tableta comprobado a 768 px: tres columnas.
- Interacciones de portada verificadas: Cosplay (32 piezas; Mandaloriano primero), Soportes (8 piezas; Picoro primero) y Harry Potter (6 piezas; Fawkes en la cabecera).
- Diez imágenes de categoría cargadas, todas con fondo CSS transparente; sus fuentes tienen alfa real. Recorte final de Picoro inspeccionado en portada, sin el fragmento de mesa.
- Evidencias en `D:/BOOMART-ENTREGAS/auditoria-redisenio-20261102/`: `verificacion-categorias-v3.json`, `medios-categorias-v3.json`, `categorias-caladas-v3-movil.png`, `portada-fawkes-v3-movil.png`, `portada-cosplay-v3-movil.png`, `portada-soportes-v3-movil.png`.

Sin publicación, push, cambios de precios ni escritura en Studio. No se incluyó una fecha de estreno de Harry Potter en el sitio; esa fecha no se investigó en este avance.
