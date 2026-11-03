# Macetas: fotografia botanica uniforme

Fecha: 2026-11-02 (Peru). Estado: preparado para revision local; no publicado.

## Resultado
- 8 productos, 16 fotos de galeria, incluidas las secundarias.
- Fondo marfil, madera clara, luz natural lateral y vegetacion muy sutil. Formato 4:5, 1200 x 1500, producto completo y textura de impresion conservada.
- Pikachu, Groot, Baby Groot y Darth Vader: ambas fotos mediante recorte/composicion local expresamente autorizado por Adrian tras rechazo de la herramienta de imagenes. No se reintentaron las generaciones rechazadas. RGB del producto desde los originales; mascaras, escala, encuadre, fondo y sombra local.
- Dedo Medio, David, Minimalista y Palmera: ambas fotos editadas con image_gen e inspeccionadas visualmente.
- Fuentes originales preservadas. Inventario de origen/destino y prompts: docs/macetas-botanica-inventario.json. Fondo y mascaras: source-art/macetas/. Compositor reproducible: scripts/macetas-composite-local.py.
- data/products.json: solo image/gallery de estas 8 macetas. Los otros 92 productos y todos los datos comerciales permanecen iguales.
- 16 JPEG + 16 WebP; 48 derivados responsivos nuevos y 8 miniaturas OG. Catalogo/feeds/fichas regenerados. Las paginas ajenas solo cambian el hash del mapa compartido de imagenes.

## Validacion realizada
- Inspeccion visual de las 16 fotos; catalogo de escritorio, dos filas y vista movil de 390 px.
- Navegacion por las 8 galerias y sus segundas fotos: carga correcta y object-fit contain. Sin desbordamiento horizontal observado en la portada de Macetas a 390 px.
- 10/10 pruebas existentes: responsive-images.test.mjs y video-upload-date.test.mjs.
- Comparacion de datos contra HEAD: 8 productos modificados, exclusivamente image/gallery; 92 sin cambios.
- 16 JPEG y WebP verificados a 1200 x 1500; 48 archivos responsivos.
- build-og-images, build-responsive-images, build-ai-catalog ejecutados en ese orden. Derivados OG ajenos regenerados por cambios previos de compresion fueron restaurados para mantener el alcance.
- diff --check sin errores. Sin cambios de CSS, plantillas o comportamiento; no se ejecutaron las baterias de overflow/cabecera de todas las paginas.

## Revision y continuidad
- Vista previa: http://localhost:4185/?categoria=macetas#catalogo
- Evidencias: D:/BOOMART-ENTREGAS/macetas-revision-20261102/ (catalogo-escritorio.png, catalogo-segunda-fila.png, catalogo-movil.png, galeria-movil.png).
- Worktree: D:/BOOMART-ENTREGAS/macetas-fotos-20261102; branch codex/macetas-fotos-20261102; base 67e4a251f36d442ddc112fddbeee4c0c821cae15.
- Checkout canonico D:/CODIGOS BOOMART APP conserva sus 8 archivos ajenos sin tocar.
- Siguiente paso: revision de Adrian; publicar solo al recibir autorizacion para Macetas. No hubo push ni cambio en produccion.
