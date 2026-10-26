# Compartir catálogos por categoría

Pedido y aprobación de Adrián, 26/10/2026. Botón «Compartir categoría» en las páginas propias de cada categoría y en el catálogo principal cuando hay una categoría seleccionada. Las portadas `/Halloween/` y `/saintseiya/` heredan el mismo control desde `index.html`.

El enlace compartido usa la dirección canónica de la categoría con `?src=compartir`, sin búsquedas, variantes ni productos abiertos. En móvil táctil se usa el menú nativo cuando está disponible; en escritorio se copia directamente y se muestra «Enlace copiado». Cancelar no copia ni muestra un éxito falso. Si el portapapeles moderno falla se intenta la copia compatible; si ambas fallan, se ofrece el enlace seleccionable. Se conserva el foco de teclado.

## Implementación

- `src/category-sharing.js` y `.css`: control compartido, estado accesible y estilos de Galería de Autor.
- `src/app.js`: sincroniza categoría activa, nombre, enlace y visibilidad. Caché de la referencia en portada incrementada a v56.
- `scripts/build-ai-catalog.mjs`: genera el botón y sus recursos en las categorías. Las páginas generadas y ambas campañas se incluyen junto a la plantilla.
- Sin cambios a precios, productos, checkout, datos de clientes ni servicios de Supabase.

## Verificación del candidato

- `node --check src/category-sharing.js` y `node --check src/app.js`: correctos.
- `node scripts/build-ai-catalog.mjs`: correcto; 92 productos, 8 categorías y el alias existente de series/películas hacia figuras.
- `node scripts/test-category-sharing.cjs`: 6 escenarios correctos (escritorio, móvil, cancelación, permiso denegado, copia compatible e imposibilidad de copiar); nueve rutas de categoría, cambio de filtro, búsqueda sin resultados, limpiar filtros y ambas campañas.
- `node scripts/test-product-sharing.cjs`: 6/6 correctos. Se actualizaron expectativas antiguas de la prueba al flujo ya vigente: WhatsApp consulta por el producto; las tarjetas abren la ficha, donde está compartir; el fallo de copia muestra un mensaje explícito. No se modificó la lógica de compartir productos.
- `node scripts/check-mobile-overflow.mjs http://127.0.0.1:4173 320,360,390,414 categoria`: nueve páginas por cuatro anchos, **con problema: 0**.
- Revisión visual en navegador integrado, escritorio y 390 × 844; botón visible y legible sobre marfil.

Trabajo aislado en `D:/BOOMART-ENTREGAS/web-compartir-categorias`, rama `codex/compartir-categorias`, desde `origin/main` 90cbb89b. Los ocho cambios locales existentes en `D:/CODIGOS BOOMART APP` se conservan sin tocarlos. Estado de publicación y commit final: consultar el relevo de equipo `BA-8d28dc5f3b2f`.
