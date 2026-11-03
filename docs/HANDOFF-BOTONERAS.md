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

## Ambientes por categoria (2026-11-03)
- Adrian autorizo elegir musica relacionada para todas las categorias y pidio un efecto de pantalla de 2 segundos desde el boton.
- Nuevo modulo src/category-ambience.js: audio unico por gesto, efecto canvas tematico temporal, movimiento reducido, pausa y control flotante. Botones en cabecera y filtros.
- Diez categorias con temas relacionados. Ver assets/audio/README.md y sources.json para seleccion/procedencia. Ocho muestras nuevas de 30s, Seiya 60s y Zelda 31s existentes.
- CSS8, boomart-v2.js6, nuevo category-ambience.js1; generador sincroniza campanas Halloween y Saint Seiya. No cambia products.json ni fotos/precios.
- Verificacion real CUA: las 10 pistas reproducen sin error, se pausan al navegar; el efecto aparece y desaparece mientras continua el audio; pausa flotante sincroniza ambos botones; clic rapido cancela; movimiento reducido conserva musica sin canvas; carrito pausa.
- Diez categorias revisadas a 320px: dos controles por categoria, sin autoplay ni overflow. Vista y efecto inspeccionados a 390px y escritorio. No se probo en iPhone/Android fisicos; no se afirma escucha humana completa de todas las pistas.
- JS syntax y 10/10 pruebas existentes correctas; header-gap 18 casos sin huecos. Datos comerciales y recursos de otros cambios preservados.
- Evidencias D:/BOOMART-ENTREGAS/ambientes-revision-20261103/ y verificaciones de medios en botoneras-revision-20261103/.
- Sigue siendo propuesta local en localhost:4186; pendiente de indicacion de publicar.

## Correccion de tarjeta Marvel y DC — 2026-11-03
- El nuevo calado completo de Dr Doom conservaba dos transformaciones del recorte anterior: scale(1.35) y translateY(-11%). Se retiran ambas reglas especiales, incluida hover; ahora usa contain y el margen comun de las tarjetas.
- CSS v10 sincronizado en inicio y campanas. No cambia el asset ni la cabecera de categoria.
- Navegador escritorio: mascara completa, incluida parte superior y menton. En 320/390px, imagen dentro del area con margen superior22px/inferior10px y sin overflow. Captura escritorio tambien con hover comun activo, sin corte. Evidencias en D:/BOOMART-ENTREGAS/doom-tarjeta-20261103/.
- Correccion puntual autorizada para produccion por el pedido actual. Estado de publicacion y SHA final en el relevo del equipo. Las secciones antiguas de propuesta pendiente son historicas: los ambientes y las botoneras ya se publicaron en el avance anterior.
