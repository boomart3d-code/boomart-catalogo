# Botoneras del catalogo: revision minimalista

2026-11-03. Preparado para revision local. No publicado.

## Cambio
- Categorias: pestanas sin recuadros, tipografia sobria, seleccion con subrayado rojo BoomArt y mayor peso. Cosplay usa el mismo estilo, sin naranja heredado de Halloween.
- Tipos de Saint Seiya: selector segmentado de fondo piedra y seleccion marfil con sombra sutil.
- Ordenar: selector nativo con borde suave y flecha discreta.
- Movil: barra horizontal deslizante, altura tactil de 48px y seleccion activa visible al entrar/cambiar categoria. Los tipos de pieza tambien mantienen visible la seleccion en 320px.
- Accesibilidad: aria-pressed en categorias, foco visible y preservado al regenerar categorias/tipos/orden; animaciones respetan reduced-motion. Contraste del texto secundario ajustado tras medir 4.43:1 del primer candidato.
- Versiones de cache: boomart-v2.css 7, boomart-v2.js 4, app.js 68 en index.html.
- Sin cambios de productos, precios, imagenes, cabecera, checkout ni plantillas estaticas.

## Validacion
- node --check src/app.js y src/boomart-v2.js: correctos.
- check-header-gap: 18 pagina/ancho, con hueco 0.
- check-mobile-overflow: 11 categorias x 320/390, con problema 0.
- CUA: inspeccion de escritorio y movil 320/390; navegacion entre Saint Seiya/Marvel/Zelda; filtros Templos (18) y Cascos/tiaras (3); orden mayor precio (250,100,100); seleccion/foco correctos y categoria activa visible. Sin errores de consola.
- diff --check correcto.

## Entrega
- Worktree D:/BOOMART-ENTREGAS/botoneras-20261103; branch codex/botoneras-20261103; base 5cec11a120c6c2d8566de6f4a7f00e7b709bf655.
- http://localhost:4186/?categoria=saint-seiya#catalogo
- Evidencia D:/BOOMART-ENTREGAS/botoneras-revision-20261103/botoneras-escritorio.png y botoneras-movil.png.
- Checkout canonico D:/CODIGOS BOOMART APP con 8 cambios ajenos preservado sin modificaciones.
- Siguiente paso: revision visual de Adrian. Publicacion pendiente de su indicacion; no se hizo push.

## Correccion posterior: Dr. Doom completo
- 2026-11-03: el archivo anterior assets/hero/tile-marvel-dc.webp ya tenia cortada la barbilla. No era un recorte de CSS.
- Nuevo calado transparente desde assets/products/mascara-dr-doom-hero.webp mediante image_gen, manteniendo mascara completa, retirando pared y pedestal; revisado visualmente contra la foto de origen.
- Nuevo asset assets/hero/dr-doom-cutout-v2.webp (800x1000, 114340 bytes), tres derivados responsivos. Original generado preservado en C:/Users/osore/.codex/generated_images/01a195d2-e8b0-7451-8144-c2fb9fbc6e20/exec-69ad4ba4-13cc-4d32-8e95-64f4a9ac07ee.png.
- Tema Marvel usa el nuevo archivo; mejora cabecera y su miniatura de coleccion. Original anterior y galeria del producto preservados.
- boomart-v2.js cache version 5; mapa de imagenes y sus referencias regenerados con build-responsive-images y build-ai-catalog. Datos comerciales intactos.
- Verificacion CUA: escritorio y movil 390px, mascara y menton completos, object-fit contain, sin overflow horizontal. Evidencias doom-completo-escritorio.png y doom-completo-movil.png en la carpeta de revision.
- Mantiene estado de propuesta local pendiente de publicacion.
- Comprobacion adicional: 6/6 pruebas responsivas. Diff de las paginas generado limitado al hash de imagenes; Halloween/saintseiya tambien sincronizan las versiones CSS/JS de la propuesta, como hace su generador. Sin cambios en products.json.
