# Visibilidad orgánica — 3 de noviembre de 2026

Encargo de Adrián: resolver aviso de Merchant Center y mejorar descubrimiento orgánico de boomart.pe en buscadores. Trabajo aislado desde main 764af8a2, sin tocar los 8 cambios ajenos del checkout canónico.

## Diagnóstico verificado

- Merchant Center 5849118628: 100 productos aprobados, 0 rechazados/revisión/limitados; 370 clics últimos 28 días. Feed URL con 100 productos Perú/español. Actualización manual completada a las 09:33, 100 actualizados, 0 nuevos, todos los atributos reconocidos y sin problemas de archivo. La actualización anterior ya había incorporado 3 productos; no atribuir esas 3 altas a esta sesión.
- Se pulsó «Añadir todos los productos encontrados». Confirmación posterior: gestiona todos los productos de la tienda y añadirá los nuevos encontrados. Fuente automática cada 24h, 0 adicionales en ese momento; se solicitó refresco. No afirmar que se añadieron otros 3.
- Search Console propiedad de prefijo https://boomart.pe/ accesible; propiedad de dominio no disponible. Informe con fecha 22/10/2026: 53 indexadas, 66 excluidas (54 descubiertas, 2 rastreadas, 9 alternativas canónicas, 1 noindex). No son datos de hoy. /saintseiya/ es campaña noindex deliberada; no retirar su protección.
- Sitemap registrado correcto, última lectura 31/10, 116 descubiertas; entrada histórica incorrecta «/» con 1 error. No confundir ese envío incorrecto con un fallo del sitemap real.
- Auditoría HTTP pública: 120 URLs del sitemap, 100 fichas y 100 items de feed. Títulos, descripciones, H1, canónicas, JSON-LD y respuestas correctos según comprobaciones implementadas. Faltaban enlaces HTML directos desde inicio a 9 de las 10 colecciones visibles; dependían de filtros ?categoria y JS.

## Cambios

- Footer y tarjetas de colecciones enlazan a páginas canónicas /categoria/.../; portada y tarjetas de producto enlazan a /producto/.../. Se conserva clic normal rápido (modal/filtros) y se permite abrir enlace en otra pestaña. Rutas Halloween preservadas.
- Meta pública msvalidate.01 para verificar el registro de Bing iniciado en esta sesión; no es contraseña ni token de API.
- IndexNow deja de avisar antes de Pages y deja de enviar solo feeds. Workflow tras page_build envía HTML cambiado incluido en sitemap, valida contenido público contra commit y conserva comprobante HTTP. 200/202 significa recibido, no indexado. Admite --all para envío inicial deliberado y --dry-run para simulación.
- Auditoría reproducible scripts/audit-seo.mjs, integrada en CI; pruebas de filtros de URLs y errores IndexNow. Sin cambios de precios, productos, fotos, envíos o condiciones de devolución.

## Validación

- Auditoría local 120 páginas/100 fichas/100 items: 0 problemas de las comprobaciones aplicadas. Antes pública: 1 página con 9 enlaces ausentes. Resultado público posterior, recibo de IndexNow y evidencias externas en D:/BOOMART-ENTREGAS/seo-organico-evidencia-20261103/.
- node --check app.js / boomart-v2.js / audit-seo.mjs; 13/13 tests (IndexNow + imágenes responsivas + fechas de vídeos); header-gap 18 casos, 0 huecos.
- Navegador: colecciones navegan sin recargar, enlaces de producto abren el modal; 390px sin desborde; imagen íntegra, estilos conservados. Vista temporal restablecida.
- scripts/test-official-prices.mjs falla también en BASE 764af8a2 (pandora-box-caballeros-dorados: espera 40, obtiene 400; fixture antiguo ignora modelOptions al calcular expectativa). No se cambió carrito/precio ni se presenta esa batería como aprobada.

## Seguimiento

La publicación y las verificaciones de Bing/Search Console se registran en el informe final externo con SHA y comprobantes. La aceptación por buscadores no garantiza indexación ni posiciones. Revisar evolución el 3 de diciembre de 2026 (fecha recomendada, sin tarea programada). Priorizar después contenido útil de categorías y consultas reales; no modificar títulos/descripciones en masa sin revisión de muestra.
