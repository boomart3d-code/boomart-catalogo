# Saint Seiya: fotos principales naturales

Fecha: 2026-11-02, hora local de Lima. Estado: preparado localmente; NO publicado.

## Resultado

39 de 39 primeras fotos de Saint Seiya editadas con la herramienta integrada image_gen.
Pared neutra gris cálido, mesa de piedra mate, luz suave de ventana y sombras de contacto.
Sin galaxia, fuego, columnas decorativas, partículas ni brillos añadidos al fondo.
Las versiones iniciales con columnas fueron descartadas antes de modificar el catálogo.

Las fotos finales están en `assets/products/<id>-natural-v1.jpg` y `.webp`, todas a 1200 × 1500 (4:5).
Originales conservados. `docs/saint-seiya-natural-manifest.json` registra cada origen, archivo generado, destino y prompt completo.
La edición usa los productos de las fotos originales como referencia; no es una garantía de identidad píxel a píxel propia de una máscara manual.
Se revisaron visualmente las 39 salidas: pieza completa, color/acabado, conjunto y cantidad visibles.

Solo cambian `image` y `gallery[0]` de los 39 productos en `data/products.json`.
Precios, IDs, textos, dimensiones, categorías, variantes y todas las fotos secundarias se conservaron.
Los 61 productos restantes mantienen todos sus datos. Los derivados y páginas se regeneraron.

Se corrigió además el recorte de fotos verticales en el modal V2: imagen contenida dentro de su celda real, fondo marfil y flechas legibles.
CSS con versión 6 en inicio y campañas. No se alteraron carrito, pagos, cuentas ni Studio.

## Verificación

- Generación de miniaturas para compartir: 39 actualizadas, 61 sin cambios.
- Pipeline: build-responsive-images antes de build-ai-catalog; 117 nuevos derivados de 120/360/720 px.
- Mediana del WebP de 720 px de estas fotos: 24 KB; 39 fichas estáticas apuntan a las fotos nuevas.
- 10 pruebas existentes de imágenes adaptables y fechas de video: aprobadas.
- Comparación de datos contra HEAD: 100 productos, solo 39 pares de campos de foto modificados; galerías secundarias idénticas.
- Desbordamiento móvil: 111 páginas × 320/360/390/414 px, 0 problemas.
- Cabecera: 18 comprobaciones, 0 huecos.
- Revisión real en navegador a 390 × 844 y escritorio: 39 tarjetas con foto natural; 0 imágenes visibles rotas; ficha de Atena completa.
- diff --check aprobado.

Evidencia: carpeta `revision/` con capturas de colección y ficha en móvil/escritorio y los registros de comprobación.

## Continuidad

Vista previa: http://localhost:4184/?categoria=saint-seiya#catalogo
Worktree: D:/BOOMART-ENTREGAS/saint-seiya-fotos-20261102
Rama: codex/saint-seiya-fotos-20261102
Base publicada conservada: 0ed84cb5e117b684e150c0d00468c518c8201510.
Pendiente: revisión visual de Adrián y publicación cuando la indique para este lote.
No se hizo push. El checkout canónico mantiene sus ocho cambios ajenos sin tocar.
