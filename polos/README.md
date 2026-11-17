# BoomArt Polos: páginas y catálogo

La tienda se genera como HTML estático y luego añade sus controles interactivos. El visitante y el buscador reciben el mismo contenido. Cada diseño y colección tiene una URL real; los enlaces anteriores con `#/p/` y `#/c/` siguen funcionando.

## Fuentes

- `plantilla.html`: estructura de página, diálogos, textos generales y versiones de CSS/JS.
- `data/polos.json`: catálogo público vigente, fotos, precio, tallas, medidas y promoción.
- `catalogo.local.json`: fuente editable del catálogo, que también debe conservar las descripciones correctas.
- `seo-core.js`: URL, identidad de página y schema compartidos entre generador y navegación.
- `polos.js`: fotos, filtros, favoritos, navegación y compra.
- `seo.css`: ajustes para las páginas propias y el contenido inicial.

No editar directamente `index.html`, `diseno/*/index.html`, `coleccion/*/index.html`, `catalogo.json`, `llms.txt` ni `data/seo-pages.json`: son salidas generadas. No cambiar precios, fotos ni condiciones para conseguir marcado SEO más completo. Las medidas marcadas provisionales se presentan como referenciales. No se inventan existencias, reseñas ni identificadores comerciales.

La propia `plantilla.html` lleva `noindex` porque es un archivo de desarrollo, no una página de catálogo. El constructor sustituye esa directiva por `index, follow, max-image-preview:large` en las páginas públicas generadas. La huella `data-catalog-revision` cambia cuando cambian los datos y evita reutilizar un JSON anterior desde la caché.

## Generar y comprobar

```powershell
node scripts/build-polos-seo.mjs
node scripts/build-ai-catalog.mjs
node --test scripts/polos-seo.test.mjs polos/catalogo-core.test.cjs scripts/indexnow.test.mjs
node scripts/audit-seo.mjs
```

El segundo generador incorpora las 23 páginas actuales de Polos al sitemap general y añade su catálogo a `llms.txt` y `llms-full.txt`. Mantiene también los derivados existentes del catálogo 3D. El workflow `build-ai-catalog.yml` escucha las fuentes de Polos, regenera y comprueba los resultados cuando se publique un cambio autorizado.

`seo-pages.json` es el inventario de páginas generadas. Si desaparece un producto, el constructor retira únicamente sus antiguas páginas de ese inventario dentro de `polos/diseno/` y `polos/coleccion/`, con validación de rutas. No elimina carpetas ajenas.

Antes de publicar, comprobar navegación directa y desde la tienda, compatibilidad de enlaces anteriores, volver a la colección, favoritos, corte/talla y carrito, y lectura sin JavaScript. Usar datos ficticios y no completar pagos ni pedidos reales.

## Publicación e indexación

Publicar requiere la aprobación de Adrián. Después del despliegue, el flujo existente de IndexNow puede notificar las URL incluidas en el sitemap que hayan cambiado en el commit publicado. Recibir una notificación no demuestra indexación. El estado real de Google y Bing debe verificarse con Search Console y Bing Webmaster Tools; no se almacenan credenciales en este repositorio.
