# Radar Saint Seiya Perú

Un portal editorial de BoomArt para seguir los anuncios de Los Caballeros del Zodiaco, entender qué significan para el público peruano y conversar con otros coleccionistas.

## Qué ofrece la primera versión

- Portada con notas, buscador, filtro por tema, calendario de lanzamientos y canal RSS.
- Cobertura de figuras licenciadas, manga, anime y cine, videojuegos, aniversarios y curiosidades.
- Fichas legibles sin JavaScript, con enlaces a las fuentes y su propia dirección para compartir.
- Lectura pública. Los lectores entran por correo para valorar una nota de una a cinco estrellas, comentar, responder, subir una foto propia o enviar un reporte.
- Bandeja privada de moderación. Un aporte se publica al aprobarlo. El equipo también puede atender reportes y ocultar comentarios o fotos.
- Los autores aparecen con el alias que elijan. Los correos de acceso quedan en el sistema de autenticación.

## Trabajo editorial diario

1. **Revisar fuentes.** Priorizar sitios de fabricantes, editoriales, estudios, desarrolladores y cuentas públicas de autores que se puedan verificar. Guardar el enlace directo y la fecha de consulta.
2. **Decidir el tipo de nota.** Publicar un anuncio, una actualización peruana, una guía o una pieza de archivo. Podemos tener una nota diaria aunque ese día se use material de archivo claramente fechado.
3. **Contar qué cambió y por qué importa.** Usar resumen propio. Distinguir el anuncio oficial, su mercado y fecha, y el estado en Perú. En precios locales, indicar moneda, comercio y fecha de comprobación. Atribuir citas y usar fotos propias o material autorizado.
4. **Abrir una conversación.** Cerrar con una pregunta breve que se pueda responder desde la experiencia del lector. Dar seguimiento a los comentarios y aprobar fotos con permiso de sus autores.
5. **Preparar la difusión.** Escribir un texto breve para el grupo o foro, aportar un dato concreto y enlazar la nota completa. Publicar donde permitan compartir enlaces. Usar una pieza propia para redes de BoomArt y un texto ajustado a cada comunidad.

### Ejemplo de difusión para el estreno

> Tamashii puso en el calendario de diciembre la primera armadura de Bronce de Pegaso Seiya en Myth Cloth EX. Si estás pensando reservarla, fíjate en el nombre de la edición: hay varias versiones de Pegaso. Dejamos la fuente y el estado de llegada a Perú en el Radar. ¿Cuál versión pondrías en tu vitrina?

Añadir a ese texto el enlace público de la nota cuando el portal esté activo.

### Fuentes de partida

- Figuras de Bandai y Blokees. [Tamashii Nations](https://tamashiiweb.com/item_brand/saintclothmyth_ex/?wovn=en) · [Blokees Saint Seiya](https://blokees.com/en-us/collections/saint-seiya-toys)
- Manga original y ediciones japonesas. [Akita Shoten](https://admin.akitashoten.co.jp/series/1343)
- Anime, cine y videojuegos. [Toei Animation](https://www.toei-animation.com/catalog/saint-seiya/) · [Sony Pictures](https://www.sonypictures.com/movies/knightsofthezodiac) · [Bandai Namco Entertainment](https://www.bandainamcoent.com/games/saint-seiya-soldiers-soul)

## Cómo mantenerlo

La redacción trabaja en `data/radar-noticias.json`. Cada nota tiene un identificador estable, tema, tipo, fecha, título, bajada, texto, pregunta y enlaces a las fuentes. Los lanzamientos pueden incluir un mes, su mercado y el estado peruano. Una corrección conserva el mismo identificador para que el enlace se mantenga.

El generador `node scripts/build-ai-catalog.mjs` produce la portada, cada artículo, la bandeja, el RSS, el sitemap y el resumen de `llms.txt`. Estos documentos se verifican con `node scripts/audit-seo.mjs`. La primera versión contiene seis notas con fuentes. El contenido inicial y sus próximos cambios deben revisarse desde la vista local antes de ir a producción.

## Puesta en marcha

- Revisar el portal en la vista local y acordar quién moderará los primeros aportes.
- Verificar los permisos del proyecto Supabase, las redirecciones de inicio de sesión para artículos y moderación, y un envío real de correo desde la configuración del entorno de destino.
- Aplicar `supabase/migrations/202611270001_radar_comunidad.sql` en el entorno aprobado. Registrar en `radar_moderators` las cuentas autorizadas por su identificador de Auth. La sección de moderación queda fuera del sitemap.
- Acordar un canal para solicitudes de retiro y una rutina de limpieza de fotos subidas que quedaron sin aporte. Las fotos se guardan en un depósito privado. Los enlaces para mostrar fotos aprobadas caducan a los tres minutos.
- Publicar el portal y probar con cuentas de verificación un voto, un comentario y una foto antes de invitar a terceros. La difusión en grupos y foros sigue el permiso de sus administradores.

## Qué mirar después del estreno

Cada semana, revisar notas leídas, enlaces compartidos, aportes aprobados y cuántos lectores vuelven a participar. El primer indicador de comunidad es que una visita se convierta en una pregunta, una respuesta o una foto propia. Una serie de comentarios útiles vale más que un pico aislado de visitas.
