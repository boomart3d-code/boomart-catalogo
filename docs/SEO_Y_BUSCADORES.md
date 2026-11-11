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
- Templos (desde el 12-nov-2026): precio publicado = combo. `templo-aries` (combo S/130), `templo-aries-temple` (templo solo S/100), `templo-aries-pandora` (Pandora Box + pedestal S/45), `templo-aries-pedestal` (S/30), `templo-aries-pandora-sola` (S/20). Opciones en `TEMPLE_OPTIONS` del generador y `templePricing` de cada templo. Las máscaras con modelos, el signo/set y los skins siguen el mismo patrón.
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
- **ChatGPT Ads** (guía completa, grupos de campaña, plazos y renovación en `docs/CHATGPT_ADS.md`): `feed-openai.csv` (recomendado), `feed-openai.txt` (tabulado) y `feed-openai.jsonl`, siguiendo la especificación oficial https://developers.openai.com/commerce/specs/file-upload/products. NO es XML. Una fila por opción de compra; las opciones de un mismo producto forman un grupo (`group_id`, `variant_dict`). Ads Manager importa por **CSV/TXT, URL alojada HTTPS o SFTP** (Centro de Ayuda de OpenAI); BoomArt usa la **URL alojada** `https://boomart.pe/feed-openai.csv` y conserva SFTP como alternativa. Perú y la moneda PEN están confirmados por OpenAI (mínimo diario 13 PEN); falta completar el registro de la cuenta.

## 7. Google Search Console

La propiedad `https://boomart.pe/` ya está verificada (meta `google-site-verification` en `index.html`; Bing con `msvalidate.01`). Tras publicar esta rama:

1. Search Console → Sitemaps → reenviar `https://boomart.pe/sitemap.xml` (124 URLs).
2. Inspección de URLs → «Solicitar indexación» para páginas nuevas o muy importantes (límite aproximado de 10 al día): portada, `/categoria/saint-seiya/`, `/producto/templo-aries/`, etc.
3. Informe «Indexación de páginas»: revisar «Descubierta: actualmente sin indexar» (el 21-oct eran 56) y repetir cada semana.
4. Merchant Center → Productos: confirmar que no aparezcan diferencias de precio con la ficha.
5. Opcional: probar una ficha en https://search.google.com/test/rich-results (con la URL ya publicada).

No usar la Indexing API para fichas de producto (no es un uso admitido). IndexNow ya se ejecuta solo tras cada publicación (`indexnow.yml`).

## 8. Decisiones y datos pendientes de Adrián

- **Plazos de fabricación** (RESUELTO el 12-nov): sencillas 24 a 48 horas, elaboradas 3 a 5 días, desde `data/plazos-fabricacion.json` (fichas, `politicas.html`, catálogo y los tres feeds). Falta revisar la clasificación sencillo/elaborado y el texto «48 horas útiles» del formulario de pedido de `index.html` (no se tocó).
- **Categoría de temporada**: de noviembre a septiembre se llama «Cascos, Máscaras y Cosplay» (`CATEGORY_LABELS` en `src/app.js` y el generador) y los nombres van sin «· Halloween»; en octubre se restauran desde `data/temporada-halloween-nombres.json`. La URL `/categoria/halloween/` no cambia.
- **Feed de ChatGPT**: si la foto principal es .webp, el feed usa su copia JPG de `assets/feed/` (la web no cambia). Para una foto nueva en .webp, crear allí la copia `.jpg` con el mismo nombre.
- **Disponibilidad «A pedido»**: el feed de OpenAI usa `backorder` (no afirma stock; ver `docs/CHATGPT_ADS.md` §3). Google, Meta y los datos estructurados siguen en `InStock`/`in_stock`; unificarlos es una decisión comercial pendiente.
- **Devoluciones**: los datos estructurados dicen «no permitidas» (`MerchantReturnNotPermitted`) pero `politicas.html` acepta fallas de fabricación (7 días) y daño de transporte (48 h). No se inventó ninguna política; las definiciones que faltan están en `docs/CHATGPT_ADS.md` §7.
- **`belen-iluminado`** no tiene `availability` en `data/products.json` y no hay ningún dato de existencias: en el feed de OpenAI sale `unknown` y fuera de anuncios hasta que se confirme.
- **Precio de templos** (RESUELTO el 12-nov): se publica el combo S/130 en ficha, tarjetas, catálogo y feeds; dentro se compran templo, Pandora Box + pedestal, pedestal o Pandora Box por separado.
- **`priceRange` de la portada** dice «S/45 - S/500»; los precios del catálogo van de S/20 a S/1500.
- **Accesibilidad** (Lighthouse móvil): contraste de color en `.eyebrow`, `.pr` y enlaces rojos (colores, no tocados) y nombres accesibles de las tarjetas de la tienda (JS).
