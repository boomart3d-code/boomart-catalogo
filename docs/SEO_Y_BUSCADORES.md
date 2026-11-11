# SEO, indexación y buscadores con IA — boomart.pe

Guía operativa. Estado verificado el 2026-11-10 sobre `origin/main` (4989ea86) más la rama `seo-integral`.

## 1. Cómo se genera todo (fuente única)

`data/products.json` es la ÚNICA lista de productos. `node scripts/build-ai-catalog.mjs` produce, a partir de ella:

| Salida | Para qué |
|---|---|
| `producto/<id>/index.html` (104) | Ficha indexable por pieza: H1, precio por opción, fotos con `alt`, JSON-LD `Product` + `BreadcrumbList` |
| `categoria/<slug>/index.html` (11) | Landings de categoría con `ItemList` |
| `catalogo.html`, `catalogo.json`, `llms.txt`, `llms-full.txt` | Catálogo legible sin JavaScript, para Google y asistentes de IA |
| `feed-google.xml` | Google Merchant Center / Pinterest |
| `feed-meta.csv` | Instagram / Facebook |
| `feed-openai.jsonl`, `feed-openai.csv` | ChatGPT (búsqueda de productos y ChatGPT Ads) |
| `sitemap.xml` + `data/seo-lastmod.json` | Mapa del sitio con `lastmod` real |

Al agregar, editar o quitar un producto: editar `data/products.json`, ejecutar el generador y subir todo lo regenerado (en GitHub lo hace solo el flujo `build-ai-catalog.yml`).

## 2. Validaciones automáticas

```
node scripts/build-ai-catalog.mjs
node scripts/audit-seo.mjs            # títulos, canonical, H1, JSON-LD, es-PE, enlaces del home, feed de Google
node scripts/validate-feeds.mjs       # mismos productos/precios/fotos en catálogo, páginas, sitemap y los 4 feeds
node scripts/test-official-prices.mjs # precios oficiales vs feeds, fichas y carrito
```

`audit-seo.mjs --live` hace la misma revisión sobre el sitio publicado (fallará en «es-PE» hasta que se publique esta rama). Con servidor en `localhost:4173`: `check-mobile-overflow.mjs` y `check-header-gap.mjs` (reglas del `AGENTS.md`).

## 3. Datos estructurados (JSON-LD)

- Una `Offer` por opción de compra, con `name`, `sku` y `price` propios. Fuente: `purchaseOptions()` en el generador. La primera opción es la base: su SKU es el id del producto y su precio es el de los feeds de Google/Meta y la meta `product:price:amount`.
- Templos: `templo-aries` (templo solo S/100), `templo-aries-pandora` (S/45), `templo-aries-combo` (S/130). Las máscaras con modelos, el signo/set y los skins siguen el mismo patrón.
- Ya NO se usa `AggregateOffer` (mezclaba precios de piezas distintas y Google exige `Offer` en fichas de comerciante).
- Los nombres para máquinas (title, JSON-LD, feeds, `og:title`) salen sin emoji; la tienda y el H1 conservan el nombre original.
- Sin valoraciones por producto, sin stock inventado, sin monto de envío (ver regla de envío).
- La portada tiene `Store` (subtipo de `Organization`, con logo, dirección y redes) y `WebSite`.

## 4. `lastmod` real del sitemap

`data/seo-lastmod.json` guarda por URL una huella del contenido generado y la fecha en que apareció. Si la página no cambia, conserva su fecha; las fechas que el generador reescribe solo (`priceValidUntil`, «Actualizado el …») no cuentan. La primera ejecución parte todo de esa fecha. Probado: sin cambios → 0 fechas nuevas; editar un producto → solo su ficha y `catalogo.html`.

## 5. Rastreadores

`robots.txt` permite Googlebot, Bingbot, **OAI-AdsBot**, OAI-SearchBot, ChatGPT-User, GPTBot y los demás asistentes (lista en el archivo) y bloquea `/admin/` y `/panel/` en todos los grupos (un grupo con nombre propio reemplaza al comodín, por eso se repiten). Verificado con sus user-agents: páginas, fotos y feeds responden 200. El sitio está en GitHub Pages: no hay CDN, firewall ni antibots propios que interfieran. Las páginas privadas (`/socios/`, `/seguimiento/`, `/polos/`, `/registro-cliente/`) llevan `noindex` y NO se bloquean en `robots.txt` para que el rastreador vea ese `noindex`.

`llms.txt` / `llms-full.txt` se mantienen como recurso complementario (no sustituyen sitemap, HTML ni datos estructurados).

## 6. Feeds

- **Google Merchant Center** (`feed-google.xml`, RSS): cuenta ya creada; los precios del feed son el precio base de cada ficha.
- **Meta** (`feed-meta.csv`).
- **ChatGPT** (guía completa, grupos de campaña y renovación diaria en `docs/CHATGPT_ADS.md`) (`feed-openai.jsonl` / `.csv`): sigue la especificación oficial https://developers.openai.com/commerce/product-feeds/spec. NO es XML. Una fila por opción de compra; las opciones de un mismo producto forman un grupo (`group_id`, `variant_dict`). Campos obligatorios presentes en las 132 filas: `item_id, title, description, url, brand, seller_name, image_url, availability, price`; para anuncios, `is_ads_eligible=true`. **Se entrega por SFTP** desde la cuenta de OpenAI Ads; el repositorio solo deja el archivo generado. La documentación estándar habla de mercado EE. UU.: confirmar en Ads Manager que Perú y soles están admitidos antes de subirlo.

## 7. Google Search Console

La propiedad `https://boomart.pe/` ya está verificada (meta `google-site-verification` en `index.html`; Bing con `msvalidate.01`). Tras publicar esta rama:

1. Search Console → Sitemaps → reenviar `https://boomart.pe/sitemap.xml` (124 URLs).
2. Inspección de URLs → «Solicitar indexación» para páginas nuevas o muy importantes (límite aproximado de 10 al día): portada, `/categoria/saint-seiya/`, `/producto/templo-aries/`, etc.
3. Informe «Indexación de páginas»: revisar «Descubierta: actualmente sin indexar» (el 21-oct eran 56) y repetir cada semana.
4. Merchant Center → Productos: confirmar que no aparezcan diferencias de precio con la ficha.
5. Opcional: probar una ficha en https://search.google.com/test/rich-results (con la URL ya publicada).

No usar la Indexing API para fichas de producto (no es un uso admitido). IndexNow ya se ejecuta solo tras cada publicación (`indexnow.yml`).

## 8. Decisiones y datos pendientes de Adrián

- **Plazo de producción**: los feeds de Google y Meta dicen «Producción ~48 h útiles». Confirmar que sigue vigente; el feed de OpenAI no lo repite.
- **Disponibilidad «A pedido»**: se publica como `InStock`/`in_stock`. Si se prefiere `PreOrder`/`pre_order`, es decisión comercial.
- **Devoluciones**: los datos estructurados dicen «no permitidas» (`MerchantReturnNotPermitted`) pero `politicas.html` acepta fallas de fabricación (7 días) y daño de transporte (48 h).
- **`belen-iluminado`** no tiene `availability` en `data/products.json`.
- **Precio visible en templos**: la ficha titula «desde S/45» (Pandora Box) mientras el feed y la descripción usan S/100 (templo solo).
- **Descripción de templos**: empieza con «Combo de la Casa de Aries…» pero el precio base es el del templo solo.
- **`priceRange` de la portada** dice «S/45 - S/500»; los precios del catálogo van de S/20 a S/1500.
- **Accesibilidad** (Lighthouse móvil): contraste de color en `.eyebrow`, `.pr` y enlaces rojos (colores, no tocados) y nombres accesibles de las tarjetas de la tienda (JS).
