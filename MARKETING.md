# Cómo sacarle provecho al catálogo (SEO, IA y publicidad)

El sitio ahora publica, de forma automática, versiones del catálogo que buscadores,
asistentes de IA y plataformas de comercio pueden leer y reutilizar. Todo se
regenera solo desde `data/products.json` cada vez que editas productos en el panel
de administración (workflow `.github/workflows/build-ai-catalog.yml`).

## Archivos que ya se publican

| URL | Para qué sirve |
|-----|----------------|
| `https://boomart.pe/catalogo.html` | Catálogo completo en HTML plano + datos estructurados (JSON-LD). Para buscadores y IA. |
| `https://boomart.pe/llms.txt` | Resumen del sitio en el estándar llms.txt. Lo buscan los asistentes de IA. |
| `https://boomart.pe/llms-full.txt` | Catálogo entero en texto/Markdown. Para pegar en una IA o pasar a aliados. |
| `https://boomart.pe/catalogo.json` | Feed de datos genérico (integraciones a medida). |
| `https://boomart.pe/feed-google.xml` | Feed formato Google Merchant Center. **Sirve también para Pinterest.** |
| `https://boomart.pe/feed-meta.csv` | Catálogo para Instagram y Facebook (Meta Commerce). |

---

## Checklist de acciones (una sola vez, por orden de impacto)

### 1. Google Search Console + Bing  — gratis, ~15 min
1. `https://search.google.com/search-console` → añade la propiedad `boomart.pe`
   (verifica con el registro TXT o el archivo HTML).
2. **Sitemaps** → envía `https://boomart.pe/sitemap.xml`.
3. **Inspección de URL** → pega `https://boomart.pe/catalogo.html` → *Solicitar indexación*.
4. Repite en Bing: `https://www.bing.com/webmasters` (puedes importar desde Search Console).
5. IndexNow (avisos instantáneos a Bing/Yandex) ya está configurado: la clave está
   en `https://boomart.pe/20f2df66390ae288bb04a34ec5418613.txt` y el workflow hace
   ping en cada cambio del catálogo. No hay que tocar nada.

### 2. Google Business Profile  — gratis, alto impacto local
- `https://business.google.com` → crea/reclama la ficha del local de Bellavista, Callao.
- Completa categoría ("Servicio de impresión 3D" / "Tienda de artículos de coleccionismo"),
  horario, teléfono, fotos y enlace a `boomart.pe`.
- Publica novedades y productos desde el panel de la ficha. Esto te hace aparecer
  en Google Maps y en búsquedas "cerca de mí".

### 3. Google Merchant Center (Shopping gratis)  — feed ya listo
1. `https://merchants.google.com` → crea la cuenta del negocio.
2. **Productos → Fuentes de datos → Añadir** → tipo *Enlace programado (feed)*.
3. URL del feed: `https://boomart.pe/feed-google.xml` · Frecuencia: diaria.
4. Configura **envíos** e **impuestos/IGV** en la sección de ajustes (no van en el feed).
5. Activa *Listados gratuitos de productos*. (Opcional: campañas de pago más adelante.)
- Nota: los productos "a pedido" van marcados como disponibles; la producción (~48 h)
  se comunica en la descripción. Si Google marca "precio no coincide", revisa que la
  ficha `catalogo.html#<id>` muestre el mismo precio del feed.

### 4. Catálogo de Meta — Instagram y Facebook Shopping
1. `https://business.facebook.com` → **Commerce Manager → Catálogo → Crear catálogo**
   (tipo *Comercio electrónico*).
2. **Fuentes de datos → Feed de datos → Usar URL** → `https://boomart.pe/feed-meta.csv`
   → programación diaria.
3. Conecta el catálogo con la cuenta de Instagram `@boomart_3d` para poder **etiquetar
   productos** en publicaciones, reels e historias.
4. (Requiere que la cuenta de Instagram sea de empresa y pase la revisión de Shopping.)

### 5. Pinterest — tráfico de decoración y coleccionismo
1. Convierte `@boomart` en cuenta de empresa: `https://business.pinterest.com`.
2. Reclama el dominio `boomart.pe` (Ajustes → Dominios y cuentas).
3. **Catálogos → Añadir fuente de datos** → `https://boomart.pe/feed-google.xml`
   (Pinterest acepta el formato de Google). Genera Pines de producto automáticamente.

### 6. Repartir el catálogo a aliados, prensa e influencers
- A cualquier blog, YouTuber, cuenta de coleccionismo o revendedor: pásale
  `https://boomart.pe/llms-full.txt`. Puede pegarlo en ChatGPT/Gemini y generar
  reseñas, comparativas o listas ("mejores tiendas 3D de Perú") en minutos.
- Para notas de prensa o fichas en directorios, usa `catalogo.html` como fuente única.

### 7. WhatsApp Business — catálogo nativo
- En la app de WhatsApp Business: **Herramientas para la empresa → Catálogo** →
  agrega los productos principales con foto, precio y enlace a `catalogo.html#<id>`.
- Así el cliente ve el catálogo sin salir del chat.

---

## Mantenimiento

- **No hay mantenimiento manual.** Editas productos en el panel → GitHub Actions
  regenera `catalogo.html`, los `llms*.txt` y los feeds, y avisa a los buscadores.
- Para regenerar a mano: `node scripts/build-ai-catalog.mjs`.
- Cada 1–2 meses: pregúntale a ChatGPT / Gemini / Perplexity *"¿dónde comprar
  figuras de Saint Seiya / decoración 3D en Perú?"* y comprueba si aparece BoomArt.
