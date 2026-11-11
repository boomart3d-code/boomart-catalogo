# ChatGPT Ads: catálogo de productos de BoomArt

Estado verificado el 2026-11-11 contra la documentación oficial de OpenAI
([especificación de feeds](https://developers.openai.com/commerce/product-feeds/spec),
[guía de feeds para Ads](https://developers.openai.com/ads/product-feeds),
[API de grupos de anuncios](https://developers.openai.com/ads/api-reference/ad-groups)).
Este trabajo deja el catálogo **preparado**. No crea campañas, no gasta y no usa credenciales.

## 1. Qué hay y de dónde sale

Todo se genera con `node scripts/build-ai-catalog.mjs` a partir de `data/products.json` (la única fuente de productos):

| Archivo (https://boomart.pe/…) | Para qué sirve |
|---|---|
| `feed-openai.csv` | El archivo que se **sube a OpenAI** (UTF-8, una fila por opción de compra: 132 filas) |
| `feed-openai.jsonl` | El mismo contenido en JSONL (formato de la especificación) |
| `feed-openai-grupos.json` | Qué `item_id` entra en cada temática y en cada grupo de campaña, listo para usar como filtro |
| `feed-openai.meta.json` | Fecha de generación, conteos y huella (SHA-256) del feed, para comprobar que lo publicado es lo generado |

**Importante: OpenAI no lee el feed desde una URL.** Según su guía de Ads, los archivos llegan **solo por SFTP**
(credenciales que genera Ads Manager al crear el feed). La URL HTTPS de arriba es la copia pública estable que sirve
de fuente y de verificación (OpenAI exige que las páginas y fotos sean URL HTTPS públicas, y lo son).

Cada fila trae identificador estable (`item_id` = id del producto; las variantes usan `id-opción`), título descriptivo
sin emoji, descripción, `product_category`, precio en PEN (`100.00 PEN`), foto, `availability`, URL individual
(`/producto/<id>/`), marca y vendedor. Las opciones de un mismo producto (templo solo / Pandora Box / combo) forman un
grupo de variantes con `group_id` y `variant_dict`.

## 2. Organizar campañas por temática

Cada producto recibe **una temática principal** y una **ruta de categoría**; además puede pertenecer a **varios grupos**.
Las reglas están en `data/ads-grupos.json` (un solo archivo editable; un error de escritura detiene el generador).

- `ads_metadata.custom_label_0` = temática principal: `anime`, `gaming`, `cosplay`, `decoracion`, `cine-y-series`, `coleccionables`, `deportes`.
- `product_category` = ruta, p. ej. `Anime > Saint Seiya > Templos del Zodiaco` (21 rutas distintas).
- Grupos (en `feed-openai-grupos.json`): `anime`, `gaming`, `decoracion`, `coleccionables`, `regalos`, `cosplay`,
  `cine-y-series`, `deportes`, `temporada-navidad`, `temporada-halloween`, `temporada-mundial`.
  **«Regalos»** = piezas hasta **S/100** + toda la categoría Navidad + las marcadas «Regalos» (el umbral es un solo
  número, `precioMax`, en el grupo `regalos`).
- Para excluir un producto de los anuncios: agregar su id a `excluirDeAnuncios` (sale con `is_ads_eligible=false`).

**Cómo usarlos en Ads Manager.** La API de OpenAI permite filtrar un grupo de anuncios por `item_id`, `product_category`,
`price` (con `lt/lte/gt/gte`), `brand`, `title`, `body`, `condition` y `age_group`. Lo más seguro es el filtro
`item_id in [...]` con la lista de `filtroItemId` del grupo elegido en `feed-openai-grupos.json`, o `product_category in [...]`
con rutas exactas. Las etiquetas `custom_label_*` aparecen en la guía del feed (solo `custom_label_0`), pero **no** están en la
referencia de filtros de la API: por eso el feed emite solo esa clave y no inventa otras.
`sugerenciaContexto` de cada grupo es un texto propuesto para el contexto del grupo de anuncios; no está verificado con la API.

**Sin promesas.** Que un producto coincida con un grupo o filtro **no garantiza impresiones**: la guía de OpenAI dice que
disponibilidad, reseñas, filtros y elegibilidad de la campaña siguen aplicando. La campaña elige entre los productos
elegibles; este catálogo solo le da buenos datos (títulos, categorías, precio, foto, disponibilidad, URL).

## 3. Renovación del catálogo

OpenAI recomienda una **carga completa al menos diaria**; un producto que falta en una carga se conserva hasta **14 días**
(con «reemplazo de catálogo» activado se borra en un día). Por eso el flujo `.github/workflows/feed-openai-diario.yml`
corre **todos los días a las 06:23 (hora de Lima)**:

1. `node --test scripts/openai-feed.test.mjs` y `node scripts/validate-feeds.mjs` (ver §4);
2. `node scripts/check-openai-feed-access.mjs --base https://boomart.pe`: comprueba el sitio publicado;
3. sube `feed-openai.csv` por SFTP **solo si existen los secretos** `OPENAI_ADS_SFTP_HOST`, `OPENAI_ADS_SFTP_USER`,
   `OPENAI_ADS_SFTP_KEY` (clave privada SSH; opcional `OPENAI_ADS_SFTP_PORT`). Sin ellos se salta el paso y lo avisa.

Si algo falla, la ejecución queda en rojo y GitHub avisa por correo. **El paso SFTP está escrito pero no probado contra un
servidor real** (no hay credenciales): la primera vez, ejecutar el flujo a mano (Actions › Run workflow) y revisar el resultado.

## 4. Pruebas

```
node --test scripts/openai-feed.test.mjs            # 19 pruebas con casos inventados y con los archivos reales
node scripts/validate-feeds.mjs                     # catálogo, fichas, sitemap y los 4 feeds cuentan lo mismo
node scripts/check-openai-feed-access.mjs           # contra https://boomart.pe (o --base http://localhost:4173)
```

Detectan: productos **incompletos** (cada campo obligatorio), **duplicados** (item_id, offer_id, título),
**desactualizados** (precio distinto de la ficha, productos que faltan, productos retirados que siguen en el feed, huella
distinta de la del archivo, feed publicado distinto del generado), **enlaces incorrectos** (página o foto que no existe,
redirecciones, respuestas distintas de 200, canonical o `noindex` en la ficha, precio publicado distinto del feed),
categorías o etiquetas ausentes, grupos huérfanos o vacíos, y que `robots.txt` bloquee a OAI-AdsBot u OAI-SearchBot.
La comprobación de acceso hace 1.006 peticiones (104 páginas, 393 fotos y 6 archivos × 2 rastreadores) y tarda unos segundos.

## 5. Lo que te toca a ti (nada de esto lo hace el repositorio)

1. **Confirmar con OpenAI que Perú y soles están admitidos.** La documentación solo muestra EE. UU. y USD; la especificación
   dice que otros mercados requieren confirmación de OpenAI. Sin eso, un catálogo en PEN puede no aceptarse o no servirse.
2. En Ads Manager: **Tools › Feeds › Create feed**. Genera las credenciales SFTP (con clave SSH o contraseña; el flujo diario usa clave SSH).
3. Guardar las credenciales como secretos del repositorio (nombres en §3) y ejecutar el flujo diario a mano una vez.
4. Un informe de terceros menciona que OpenAI pide una **muestra de 100 productos** a los anunciantes nuevos; no está en su
   documentación oficial. Si ocurre, bastará una carga parcial del CSV.
5. No activar la campaña hasta revisar los problemas de entrega («serving issues») que muestra Ads Manager.

## 6. Qué NO se pudo verificar

- Que Ads Manager acepte este feed y el mercado Perú/PEN (no hay cuenta ni credenciales aquí).
- El paso de subida SFTP (ver §3).
- El formato de las claves de contexto del grupo de anuncios (`context_hints`).
- La frase «los productos caducan a las dos semanas»: la documentación habla de **conservar hasta 14 días** lo que falta en una carga;
  el flujo diario cubre ambos casos.
- Las fotos `.webp` (20 filas): la especificación cita JPEG/PNG como ejemplos pero no prohíbe WebP.
