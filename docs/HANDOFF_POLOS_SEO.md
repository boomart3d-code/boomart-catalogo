# Polos: SEO, lectura IA y páginas propias

Codex · 17 de noviembre de 2026 · **Candidato local listo para revisar; no publicado**.

Encargo de Adrián: resolver los problemas de la auditoría de Polos y mejorar su preparación para buscadores e IA. La autorización de publicación anterior correspondía a la conexión desde la portada; esta versión nueva espera su aprobación.

- Worktree: `D:/BOOMART-ENTREGAS/web-polos-seo-20261117`.
- Rama: `codex/polos-seo-20261117`, basada en `4167e6d3` de `origin/main`.
- Reserva: `BA-863b0e947f78`.
- Vista previa: `http://127.0.0.1:4175/polos/`.
- Ejemplo: `http://127.0.0.1:4175/polos/diseno/harry-potter-negro/`.

## Cambios

1. La tienda pública generada permite indexación y vistas previas de imagen grandes. Incluye canonical, descripción, Open Graph, Twitter Card, idioma es-PE y JSON-LD.
2. Hay 23 páginas con contenido inicial real: tienda, cuatro colecciones y 18 diseños. Los productos incluyen fotos, precio, descripción, material y tallas en HTML; las fichas se pueden consultar por WhatsApp sin JS o si falla la carga de datos. No se inventa stock, reseñas, GTIN ni condiciones de devolución.
3. Navegación con URL propias `/polos/coleccion/<tema>/` y `/polos/diseno/<id>/`. Los enlaces anteriores con `#/c/` y `#/p/` siguen abriendo su destino y se normalizan. Navegación, canonical y schema cambian juntos en la tienda interactiva. Se conservan filtros, favoritos, guía, variantes y carrito.
4. El generador compartido agrega Polos al sitemap (147 páginas totales) y a `llms.txt`/`llms-full.txt`. También genera `polos/catalogo.json` y `polos/llms.txt`. IndexNow admite las nuevas URL a través del sitemap. No se enviaron notificaciones en esta preparación local.
5. El workflow escucha los datos y fuentes de Polos y valida la nueva salida. Fuente de HTML en `polos/plantilla.html`; no editar los HTML generados. Ver `polos/README.md`.
6. Se corrigieron las descripciones de mangas en fuente y JSON público siguiendo la indicación de mangas lisas. Se mantienen diseños, precios, fotos, tallas y promoción. Las medidas marcadas provisionales se muestran como referenciales.
7. Se evita cargar todas las imágenes del carrusel al inicio: se prepara la foto actual y la siguiente. Se mantiene el carrusel de seis fotos y sus 2,5 segundos. La huella del JSON cambia automáticamente la URL de caché de los datos. Los botones de favoritos comunican también su estado y acción a lectores de pantalla.

El constructor general también regenera los derivados existentes del catálogo 3D (incluye fechas de vigencia y huellas). No se modificaron `data/products.json` ni `data/reviews.json`, precios, clientes, ventas, pagos, conexiones o bases de datos. El checkout canónico conserva sus cambios ajenos.

## Validación

- 78/78 pruebas Node: SEO Polos, catálogo, IndexNow, feeds, plazos, disponibilidad, imágenes adaptables y fechas de video.
- Auditoría del HTML: 147 páginas, cero páginas con problemas y cero errores del feed. Las 104 piezas 3D y sus 104 entradas Google se conservan. El validador informa dos avisos previos del feed de anuncios 3D (WebP y disponibilidad de Belén); no son bloqueos ni cambios de esta tarea.
- `check-mobile-overflow`: 22 páginas de Polos × 320/360/390/414 px, con problema: 0.
- `check-header-gap`: 18 combinaciones página/ancho, con hueco: 0.
- Navegador: URL directa y desde colección; corte Hombre/talla M añadidos y retirados del carrito local; precio PEN 50, favoritos y restauración; regreso a colección; enlace anterior de Black Goku normalizado a su URL propia; ficha móvil de Travesía nocturna.
- JS desactivado: tienda con 18 productos; Dragon Ball con cinco productos; fichas con imágenes, precio, descripción, tallas y contacto. JS restablecido al finalizar.
- JSON bloqueado deliberadamente: se conserva la ficha estática con precio y consulta; bloqueo retirado al terminar. Sin errores de JavaScript observados en el recorrido normal.
- Generación estable comprobada en fixtures; retirada de páginas limitada al inventario y carpetas propias; rechazo de rutas fuera de Polos. Sintaxis y `git diff --check` correctos.
- Capturas: `D:/BOOMART-ENTREGAS/polos-seo-20261117/coleccion-escritorio.jpg`, `ficha-escritorio.jpg` y `ficha-movil.jpg`.

## Publicación y comprobación externa pendientes

Obtener la aprobación de Adrián para publicar el candidato. Antes de integrar, hacer fetch y revisar cambios remotos concurrentes. Tras publicar, esperar Pages, comprobar los 23 HTML y los recursos de descubrimiento públicos, y revisar la recepción de IndexNow. Solicitar/revisar rastreo con Search Console y Bing Webmaster Tools cuando haya acceso: no se ha confirmado indexación efectiva ni se promete una posición en buscadores.
