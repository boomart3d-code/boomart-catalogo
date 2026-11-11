# ChatGPT Ads: catálogo de productos de BoomArt

Estado verificado el 2026-11-12 contra la documentación oficial de OpenAI:
[Crear campañas desde feeds de productos](https://help.openai.com/en/articles/20001268-create-campaigns-from-product-feeds),
[Disponibilidad de Ads Manager](https://help.openai.com/en/articles/20001245-ads-manager-availability),
[Crear campañas](https://help.openai.com/en/articles/20001210-creating-campaigns-for-chatgpt-ads),
[guía de feeds para Ads](https://developers.openai.com/ads/product-feeds),
[especificación del producto](https://developers.openai.com/commerce/specs/file-upload/products) y
[referencia de grupos de anuncios](https://developers.openai.com/ads/api-reference/ad-groups).
Este trabajo deja el catálogo **preparado**. **No crea ni activa campañas, no gasta y no usa credenciales.**
(El Centro de Ayuda bloquea a los lectores automáticos: para releerlo, abrirlo en un navegador.)

## 1. Qué está confirmado

- **Perú y soles.** Perú figura «Available» para autoservicio y la moneda PEN tiene presupuesto diario mínimo de **13 PEN**.
  Condición oficial: la **entidad legal que anuncia y paga** debe estar en un país de la lista. La habilitación de la **cuenta**
  de BoomArt depende de completar su registro y requisitos en Ads Manager.
- **Tres formas de importar el catálogo:** *Upload CSV o TXT* (manual), *Hosted URL* (dirección HTTPS estable) y *SFTP*.
- **Caducidad:** «los productos caducan a las 2 semanas», por eso OpenAI recomienda URL alojada o SFTP automatizado.
- **Etiquetas:** `ads_metadata` admite claves «que soporte tu integración» (ejemplos del Centro de Ayuda: `custom_label_0`,
  `bidding_tier`, `product_line`). Se filtra con `ads_metadata.<campo>`; selecciona productos elegibles y **no** restringe dónde se muestran.
- **Sin garantías.** Coincidir con un filtro **no garantiza impresiones**: disponibilidad, reseñas, filtros y elegibilidad de la campaña siguen aplicando.

## 2. Importar por URL alojada (sin SFTP ni credenciales)

BoomArt publica su catálogo en una dirección estable que Ads Manager puede leer **sin credenciales**:

| URL | Formato | Uso |
|---|---|---|
| `https://boomart.pe/feed-openai.csv` | CSV (coma), `text/csv; charset=utf-8` | **Recomendada** |
| `https://boomart.pe/feed-openai.txt` | TXT tabulado (TSV), `text/plain; charset=utf-8` | Alternativa si el CSV falla |
| `https://boomart.pe/feed-openai.jsonl` | JSONL | Para otras herramientas (se sirve como `application/octet-stream`: **no** usar como URL alojada) |

En Ads Manager: **Tools › Feeds › Create feed** (elegir **Perú**) › menú de tres puntos del feed › **Hosted URL** › pegar la URL del CSV.
Después, **Upload History** muestra el procesamiento y los errores (de unos minutos a unas horas).

**Cómo se verificó** (sin cuenta): el CSV y el TXT responden 200 directo, sin redirecciones, sin BOM, en UTF-8, con todas las
columnas obligatorias y 132 filas; OAI-AdsBot y OAI-SearchBot los reciben. **Lo que NO se pudo verificar** es que Ads Manager los
acepte, y hay un aviso: un [reporte de la comunidad](https://community.openai.com/t/ads-manager-hosted-url-for-csv-product-feed-fails-with-unable-to-save-the-hosted-url-tsv-works/1401889)
(25-sep a 2-oct, sin resolver en el hilo) dijo que la URL alojada con **CSV** falló con «Unable to save the hosted URL» y con **TSV** funcionó,
aunque OpenAI respondió que CSV está soportado. Si ocurre: usar `feed-openai.txt`, o subir el CSV a mano, o SFTP.

### Cómo se mantiene al día
- El archivo se regenera solo (CI) con cualquier cambio de catálogo, precios o plazos, y OpenAI lo vuelve a leer por su cuenta
  (la documentación **no dice cada cuánto**). El flujo diario `.github/workflows/feed-openai-diario.yml` (06:23 hora de Lima) comprueba que la URL
  siga disponible, válida y al día, y que el catálogo se **procese** bien en OpenAI (ver §6). Si algo falla, queda en rojo y GitHub avisa por correo.
- **SFTP sigue disponible como alternativa**: con los secretos `OPENAI_ADS_SFTP_HOST`, `OPENAI_ADS_SFTP_USER` y `OPENAI_ADS_SFTP_KEY` (clave privada SSH;
  opcional `OPENAI_ADS_SFTP_PORT`) el mismo flujo sube `feed-openai.csv` cada día. Ese paso **no está probado contra un servidor real**. No es necesario
  si se usa la URL alojada.
- Si el procesamiento muestra que OpenAI **no** relee la URL con la frecuencia suficiente (límite: 2 semanas), la salida es SFTP automatizado.

## 3. Disponibilidad «bajo pedido»

Todo se fabrica bajo pedido y **no se declaran existencias inmediatas**. La especificación oficial permite solo `in_stock`, `out_of_stock`,
`pre_order` (*artículo ofrecido antes de su lanzamiento*), `backorder` (*artículo temporalmente en espera de stock*) y `unknown`;
ninguno significa «fabricado bajo pedido». Se usa **`backorder`** (no afirma stock) y la descripción lo dice desde el principio con su plazo:
«Producto fabricado bajo pedido: 24 a 48 horas de fabricación. …». Configuración: `data/ads-grupos.json › disponibilidad`.

> **Riesgo a validar en Ads Manager antes de gastar:** la guía de Ads solo documenta `in_stock` y `out_of_stock` para la entrega. Si los productos
> `backorder` no quedan «Ready» o no se sirven, cambiar `bajoPedido` a `in_stock` (una línea; la descripción ya dice que es bajo pedido).

Un producto **sin disponibilidad confirmada** en `data/products.json` sale como `unknown` y **no entra a anuncios** (`is_ads_eligible=false`).
Hoy es solo `belen-iluminado` (no hay ningún dato de existencias; solo consta su publicación el 2-nov). Para habilitarlo: confirmar y agregar
`"availability": "A pedido"` en `data/products.json`. Google, Meta y los datos estructurados de la web **no cambian** de estado (siguen `in_stock`).

## 4. Plazos de fabricación

Referencia de Adrián (12-nov): **piezas sencillas 24 a 48 horas; piezas elaboradas 3 a 5 días**. Fuente única: `data/plazos-fabricacion.json`.
Es **elaborado** si el precio base es ≥ S/150, o lleva las etiquetas «Tamaño real», «Combo» o «Set», o su id empieza por `set-`;
`forzarSencillo` y `forzarElaborado` mandan sobre la regla (hoy `set-de-12-templos-mini` y `set-santuario-15-piezas` están forzados a sencillo
porque su propia descripción ya dice «24 a 48 horas útiles»). Resultado hoy: **59 sencillas y 45 elaboradas**.
El plazo aparece en cada ficha, `politicas.html`, `catalogo.html/json`, `llms-full.txt` y en los feeds de Google, Meta y OpenAI.
La prueba `scripts/plazos.test.mjs` falla si alguna superficie deja de coincidir.
**Pendiente:** el formulario de pedido de `index.html` (y sus copias `Halloween/` y `saintseiya/`) aún dice «Fabricación: 48 horas útiles»; no se tocó por la regla de no alterar formularios.

## 5. Organizar campañas (temáticas, grupos y filtros)

Cada producto recibe **una temática principal** (`ads_metadata.custom_label_0`: `anime`, `gaming`, `cosplay`, `decoracion`, `cine-y-series`,
`coleccionables`, `deportes`) y una ruta `product_category` (21 rutas, p. ej. `Anime > Saint Seiya > Templos del Zodiaco`), y puede pertenecer a
**varios grupos** (`anime`, `gaming`, `decoracion`, `coleccionables`, `regalos`, `cosplay`, `cine-y-series`, `deportes`, `temporada-navidad`,
`temporada-halloween`, `temporada-mundial`). Las reglas están en `data/ads-grupos.json` (un error de escritura detiene el generador).
**«Regalos»** = piezas hasta **S/100** + toda la categoría Navidad + las marcadas «Regalos». Para excluir un producto: agregar su id a `excluirDeAnuncios`.

`feed-openai-grupos.json` trae, listos para un grupo de anuncios:
- por temática: `filtroEtiqueta` = `{ "field": "ads_metadata.custom_label_0", "operator": "in", "values": ["anime"] }`;
- por grupo: `filtroItemId` = `item_id in [...]` (incluye las variantes); también `product_category in [...]` y `price` (`lt/lte/gt/gte`).

No se agregan más claves de `ads_metadata` hasta ver en Ads Manager cuáles ofrece la integración de la cuenta. `sugerenciaContexto` de cada grupo es un texto
propuesto; no está verificado con la API. **Que un producto coincida con un grupo no garantiza que se muestre.**

## 6. Pruebas y control del procesamiento

```
node --test scripts/openai-feed.test.mjs scripts/openai-hosted.test.mjs scripts/plazos.test.mjs scripts/ads-disponibilidad.test.mjs
node scripts/validate-feeds.mjs                     # catálogo, fichas, sitemap y feeds cuentan lo mismo (incluye TXT = CSV)
node scripts/check-openai-feed-access.mjs           # sitio publicado: rastreadores, URL alojada, precios (o --base http://localhost:4173)
node scripts/check-openai-feed-processing.mjs       # OpenAI: ¿se procesó bien? (necesita OPENAI_ADS_API_KEY; sin ella se omite)
```

Detectan productos **incompletos**, **duplicados**, **desactualizados** (precio distinto de la ficha, productos que faltan o retirados, huella
distinta, feed publicado distinto del generado), **enlaces incorrectos** (página o foto inexistente, redirecciones, respuestas distintas de 200,
canonical o `noindex`, precio publicado distinto del feed), plazos o disponibilidad incoherentes, afirmaciones de «stock inmediato», categorías o
etiquetas ausentes, grupos huérfanos y bloqueos de OAI-AdsBot u OAI-SearchBot en `robots.txt`.

**Procesamiento en OpenAI.** Con una clave de API de Ads (secretos `OPENAI_ADS_API_KEY` y `OPENAI_ADS_FEED_ID`; solo lectura), el flujo diario consulta el
historial de cargas y falla si la última carga falló, fue omitida, rechazó filas o aceptó menos de las 132; **avisa a los 7 días y falla a los 12 de la última
carga procesada** (caducan a las 2 semanas). Probado con las respuestas de ejemplo de la documentación y con un servidor falso; **no probado contra la API real**
(la clave requiere acceso a la API de feeds, que OpenAI puede tener que habilitar). Sin clave, el control de Upload History se hace a mano en Ads Manager.

## 7. Devoluciones: lo que existe y lo que falta

El feed solo enlaza la política vigente (`return_policy` → `politicas.html#cambios-y-devoluciones`). **No** se declaran `accepts_returns` ni plazo de
devolución: la política actual es «sin devoluciones por cambio de opinión; solo reembolso, reparación o reemplazo por falla de fabricación (reclamo hasta 7 días)
o daño de transporte (hasta 48 horas), con fotos o video y coordinación previa». Para completar los datos estructurados y Merchant Center faltan estas definiciones **de Adrián**:
1. Si la tienda se declara «venta final» (`accepts_returns=false`) aun con la excepción por defecto o daño; el campo no puede expresar «solo defectos».
2. Cuántos días tarda el reembolso (hoy: «dentro de los días siguientes a la aprobación»).
3. En cuántos días se responde un reclamo.
4. Si algún producto (p. ej. personalizado) tiene reglas distintas.
5. La validación legal de derechos del consumidor en ventas a distancia (Indecopi o un abogado); aquí no se afirma nada legal.

## 8. Lo que te toca a ti

1. Completar el registro de la cuenta de Ads Manager (entidad legal en Perú) y crear el feed (**país: Perú**).
2. Importar con **Hosted URL** (`feed-openai.csv`; alternativa `feed-openai.txt`), revisar **Upload History** y los conteos (Ingested / Processed / Not approved / Ready).
3. Revisar qué productos quedaron aceptados y «Ready» (sobre todo con `backorder`) y los problemas de entrega antes de definir presupuesto (mínimo 13 PEN diarios).
4. Confirmar `belen-iluminado`, la clasificación sencillo/elaborado (`data/plazos-fabricacion.json`) y las definiciones de §7.
5. Opcional: guardar `OPENAI_ADS_API_KEY` (y el id del feed) para que el flujo diario vigile el procesamiento.

## 9. Qué NO se pudo verificar

- Que Ads Manager acepte este feed por Hosted URL, ni con qué frecuencia lo relee, ni que los productos `backorder` queden «Ready».
- El paso de subida SFTP y la API de procesamiento contra servicios reales.
- Qué otras claves de `ads_metadata` admite la integración de la cuenta, y el formato de `context_hints`.
- Las fotos `.webp` (20 filas): la especificación cita JPEG/PNG como ejemplos pero no las prohíbe.
- Los campos `target_countries` y `store_country` no se envían: el país se elige al crear el feed; si Upload History muestra diagnósticos sobre ellos, revisarlo.
