# Polos: visibilidad y condiciones comerciales

Codex · 17/11/2026 · Reserva BA-2c78d776ade2. Worktree `D:/BOOMART-ENTREGAS/web-polos-visibilidad-20261117`, rama `codex/polos-visibilidad-20261117`, base43de54e6. Adrián autorizó hacer y publicar las mejoras propuestas y usar Google desde su navegador.

## Resultado preparado para publicar

- 26 páginas Polos:23 existentes y guías de tallas, cuidados, cambios/devoluciones. Sitemap total150. Medidas actuales en HTML sin JS; siguen señaladas como referenciales porque la fuente mantiene `medidas_provisionales:true`.
- Condiciones confirmadas por Adrián: base disponible, estampado al pedir, despacho mismo día o siguiente de confirmar para todos los diseños/tallas; cambios de talla y devoluciones por preferencia en primeras24h tras recibir, prenda sin uso/lavado, buen estado, etiqueta; transporte del cliente. Falla de fábrica/error de BoomArt: transporte y reposición de BoomArt, recambio o devolución del dinero. Reembolso hasta3 días hábiles desde aceptación y recepción. Condiciones voluntarias separadas de derechos por defectos; referencia Indecopi: https://www.gob.pe/institucion/indecopi/noticias/1407060-tiendas-por-departamento-no-pueden-impedir-cambios-o-devoluciones-de-productos-adquiridos-en-sus-outlets
- Fuente Merchant separada `polos/feed-google.xml`:108 variantes por18 diseños,2 cortes,3 tallas; enlaces con corte/talla preseleccionados, identificadores estables, grupo, edad adulta, género/color/talla, precio PEN50. Sin inventar GTIN/MPN ni montos de flete. Etiqueta devolución `polos`. `in_stock` coherente con prendas base disponibles, aceptación de pedidos y despacho confirmado; referencia https://support.google.com/merchants/answer/6324448
- Schema con disponibilidad/política solo Polos. Condiciones y guías en JSON y recursos IA. Colecciones con introducciones propias.
- GA4 existente G-HM5C8Q1394 en Polos para eventos ya presentes (producto, carrito, inicio de compra, intención WhatsApp; sin Purchase ficticio). Meta sigue omitido en Polos.
- 335 derivados de138 fotos, sin recortar ni reemplazar originales. Script `scripts/build-polos-images.mjs`, manifiesto `polos/data/imagenes.json`, loader `polos/imagenes.js`; regenerados antes del catálogo en CI. Original para zoom, variantes para tarjetas/miniaturas/ficha/carrusel; conserva6 fotos/2.5s y preparación de siguiente imagen.
- Meta pública de verificación Bing en portada, pendiente de verificar tras despliegue.

## Evidencia

`D:/BOOMART-ENTREGAS/polos-visibilidad-20261117/`: auditoría local150 páginas/0 errores; pruebas.txt76 Node/0 fallos; movil.json26 páginas×4 anchos=104 controles sin desbordes; google-solicitud.png.

CUA: Mujer/L seleccionada, agregada al carrito S/50 y retirada al finalizar. Fotos adaptables cargan. Guía revisada visualmente. Feeds existentes0 errores (2 avisos previos OpenAI3D). Originales, fuentes3D, reseñas, pagos, ventas y BD no modificados. Checkout compartido no editado. Árbol canónico ajeno intacto.

## Cuentas antes del despliegue

- Search Console: sitemap reenviado confirmado17/11; lectura anterior16/11 con124URL. Inspección real raíz Polos y colecciones sin indexar. Solicitudes aceptadas raíz, Harry Potter, Dragon Ball y Zelda; Saint Seiya en proceso. Solicitud no equivale a indexación. Informe sitio entero122 páginas indexadas/18 excluidas; no atribuible a Polos.
- Merchant BoomArt5849118628:104 productos3D aprobados, fuente PRODUCTS SOURCE1. Fuente Polos pendiente de enlazar tras publicar XML. No se habilitan anuncios pagados.
- Bing: acceso Google normal autorizado; sitio añadido manualmente, verificación meta pendiente. Sin conceder importación OAuth de GSC.
- PageSpeed previo: móvil86 rendimiento/100 accesibilidad/100 recomendaciones/100SEO; laboratorio LCP4.2s. CrUX solo del origen, no atribuirlo a esta URL. Medir tras publicar imágenes.

Registrar resultado público y cuentas en relevo final. No prometer indexación, posiciones, ventas o fotos físicas no verificadas.

## Cierre comprobado

Publicado:81c166a6 (implementación),44b20be5 (Analytics tras cargar contenido),29c56929 (políticas generales distinguen Polos de piezas3D). Bot7c14a918 actualizó lastmod/sitemap. Pages44172036750 y generador44172037112 del ajuste Analytics terminaron success; publicación de políticas y texto verificados por HTTP200. Auditoría pública final150 páginas/0 errores. IndexNow recibió27 URL conHTTP200, además del workflow44172215884 success.

Merchant Center importó108 variantes en la fuente10797289318 «BoomArt Polos · diseños, cortes y tallas», fichas gratuitas, Perú/español, actualización diaria. Fuente3D104 conservada. Cuenta al cierre:212 productos,200 aprobados,12 en revisión,0 limitados,0 rechazados:96 nuevas variantes aprobadas y12 pendientes de Google. «Requiere atención» no muestra incidencias. Excepción de devolución `polos`,policy9502697877:1 día, solo nuevos, por correo, transporte del cliente, sin tarifa de reposición. Se guardó y queda sujeta a verificación de Google. Plazo de reembolso en web3 días hábiles; campo numérico ambiguo de Merchant se dejó sin completar para no convertirlo en días calendario.

Bing quedó verificado por meta. El sitemap reenviado devolvió DNS Failure en el primer intento; dominio validado con respuestas correctas en resolutores públicos Google y Cloudflare (4 registros A de GitHub Pages). Sin cambiar DNS de producción, se reenviaron150 URL mediante sitemap; último estado observado Processing. IndexNow aceptado no prueba indexación. No hay confirmación de indexación completa Google/Bing. Search Console aceptó solicitudes para raíz, Harry Potter/Dragon Ball/Zelda y ficha harry-potter-negro; Saint Seiya dio error de servicio al solicitar, cubierta por sitemap e IndexNow.

PageSpeed final17/11 18:24 Lima, móvil:76 rendimiento,100 accesibilidad,100 recomendaciones,100SEO,3/3 navegación de agentes; FCP1.7s,LCP5.3s,TBT50ms,CLS0. La entrega de imágenes reduce el ahorro potencial señalado de1874KiB a76KiB, pero no se afirma mejora global de puntuación (varía y LCP sigue siendo oportunidad). CrUX del origen no es evidencia propia de Polos. No se inventaron fotos físicas, medidas verificadas ni reseñas. Toda información que depende de revisión externa queda identificada aquí.

Evidencias adicionales: `merchant-108-polos.png`, `merchant-resultados.png`, `merchant-politica-polos.png`, `merchant-estado-final.txt`, `bing-sitemap.png`, `bing-estado-final.txt`, `pagespeed-final.txt`, `auditoria-publicada-final.json`, `politica-publicada.png` en la carpeta de entregas. No hay acción adicional del propietario necesaria para lo implementado; revisiones/indexación dependen de las plataformas.
