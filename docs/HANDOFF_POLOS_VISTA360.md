# Polos: «Ver en 360°» en la ficha (piloto local, sin publicar)

Claude · 17/11/2026 Lima · Reserva BA-b4397cf8539b, sesión claude-visor360-web-20261117-sesion-unica. Worktree `D:/BOOMART-ENTREGAS/web-visor360-20261117`, rama `claude/visor360-web-20261117`, base `9d026903` (origin/main). Adrián aprobó el plan («integrar en la web, worktree local, sin publicar»). **Publicar requiere su aprobación expresa.**

## Qué hay
- Solo Harry Potter · Travesía nocturna, corte hombre, talla M (referencia). Campo `vista360` por producto y corte en `polos/data/polos.json`; sin ese campo no aparece nada.
- `plantilla.html`: bloque `#ficha360` oculto dentro de la galería de la ficha. `polos.js` (v=67) lo muestra si el corte elegido tiene secuencia (sin corte elegido ofrece la única disponible) y **solo al pulsar** descarga `visor360.js` + `visor360.css` y la secuencia. Cambiar de corte o cerrar la ficha libera el visor. `seo.css` (v=3): 4 reglas del bloque.
- `polos/vista360/<id>/<revisión>/` (vigente: `f055d0b308c8`): manifiesto, póster, 24 cuadros WebP 720×900 y detalle del estampado. Generado desde Estampados (`scripts/visor360/`), estado «generado». Páginas regeneradas con `node scripts/build-polos-seo.mjs` (solo cambian bloque, `?v` y huella del catálogo).
- `scripts/polos-vista360.test.mjs`: 6 pruebas (plantilla y páginas sin recursos del 360, visor pequeño y aislado, manifiesto/archivos/presupuesto, producto sin 360 intacto). Se comprobó que fallan si se inyecta el visor en el `<head>`. **No se añadieron al workflow `build-ai-catalog.yml`** (decisión para quien publique).

## Comprobado (local, `python -m http.server`, navegador del escritorio)
- Antes de pulsar: 0 solicitudes del visor o del 360. Al pulsar: CSS 1,1 KB + JS 7,8 KB (2,6 KB gzip) + manifiesto + póster + 7 cuadros = 181 KB; vuelta completa 339 KB; detalle 825 KB solo al ampliar.
- Carga inicial de la ficha: +845 bytes gzip (polos.js +730, seo.css +44, HTML +71), 0 solicitudes nuevas. LCP 84-136 ms y CLS ≈ 0 en localhost (control, no es Lighthouse).
- Pruebas: 27/27 (21 del repo + 6 nuevas); `audit-seo` 0 páginas con problemas; `check-mobile-overflow` 22 páginas × 320/360/390/414 = 0; visor abierto a 320 px sin desborde. Carrito: con el visor abierto «Agregar al carrito» deja Hombre · talla M · S/ 50 (no se pagó nada; carrito de prueba vaciado). Cambiar a Mujer cierra y oculta el 360.
- `track.js` no envía datos desde localhost.

## No comprobado / pendiente
- PageSpeed público y LCP/CLS reales (requieren publicar); móvil real de gama media; Safari/Firefox; lector de pantalla.
- `validate-feeds` falla **en este worktree de Windows** por `core.autocrlf=true`: los feeds quedan con CRLF y su huella solo coincide con LF (sha256 `479cb2c2…`). No lo causó este cambio; en CI (Linux) no ocurre.
- La altura del estampado del pecho sigue la colocación aprobada en Estampados; Adrián la considera baja y la afinará después (se regenera la secuencia).
- Medidas de la prenda y escala del modelo 3D: **referenciales**.

## Para publicar / revertir
Publicar: aprobación de Adrián → `git fetch` y fusionar sobre origin/main (el CI commitea derivados con `[skip ci]`) → reservar `service:github-pages:boomart.pe` → tras Pages: HTTP de los archivos nuevos, PageSpeed público (3 consultas) y recorrido de compra. Desactivar un producto: quitar su `vista360` en `polos/data/polos.json` y regenerar (fotos, precio y compra no cambian). Revertir todo: revertir el commit. No se tocó checkout, carrito, Supabase ni precios; el checkout canónico (con 1428 cambios ajenos) quedó intacto.

## Actualización 18/11/2026 (reserva BA-a369459c65a8)
- **Secuencia reemplazada** (`f2f3b95f150b` → `f055d0b308c8`): la anterior tenía el estampado del pecho 7,6 cm demasiado bajo por un error de lectura de anclas en el proceso 3D (se leían las del mockup antiguo y no las de la pantalla «Ubicación y tamaño» de Estampados). Ahora coincide con la app (centro a 20,55 cm del borde superior). Detalle en el HANDOFF de Estampados.
- **Arreglo del visor** (`visor360.js?v=2`, `polos.js?v=68`): los botones ◀ Frente Espalda ▶ no respondían al clic real porque el visor capturaba el puntero para el arrastre también sobre ellos. Antes solo se había probado arrastre y teclado. Comprobado ahora con clics reales: Frente → cuadro 0, ▶ → 1, ◀◀ → 23, Espalda → 12, arrastre y sin errores de consola. Prueba estática añadida.
- 27/27 pruebas, audit-seo 0 páginas con problemas. Sigue **sin publicar** y con los mismos pendientes (PageSpeed público, móvil real, Safari/Firefox).
- Decisión pendiente de Adrián: quiere el 360 en todos los polos (hombre y mujer) antes de publicar; no publicar solo este diseño.

## Actualización 18/11/2026 b (reserva BA-91bd744fd318): perilla grande bajo la foto
- Pedido de Adrián: los 4 botones sobre el polo no servían y lo tapaban; quiere «una perilla grande» abajo para girar, manteniendo el giro al tocar el polo. Aprobó además la estrategia: 360 con fotos en cada polo, hombre y mujer.
- `visor360.js?v=4` / `visor360.css?v=2` / `polos.js?v=70`: la foto queda libre (nada encima) y debajo va un control deslizante nativo (`input type=range`, 52 px de alto, pulgar de 52 px) centrado en la vista inicial; sus extremos son la cara opuesta. Tres marcas tocables debajo (p. ej. Frente · Espalda · Frente, 44 px de alto). Perilla y arrastre del polo giran en el MISMO sentido y se sincronizan. Teclado: flechas sobre la perilla.
- Comprobado con arrastres y clics reales a 390 y 320 px: perilla (+7 → cuadro 5), marcas (extremos → cuadro 0, centro → 12), arrastre del polo mueve la perilla en el mismo sentido, flechas, sin desbordes ni errores de consola; control debajo de la foto (medido). 27/27 pruebas (3 aserciones nuevas), audit-seo 0.
- Sin probar: dedo real en un teléfono (solo puntero emulado), Safari/Firefox (el estilo del pulgar usa reglas -webkit y -moz por separado).

## Actualización 18/11/2026 c (reserva BA-e3173f09a30e): rueda dentada sin fin, fina y en tono hueso
- Adrián aclaró la idea: no un deslizador con tope sino una rueda dentada vista de canto (como la perilla de una rejilla de aire del carro) que gira sin fin; luego pidió que fuera más delgada, elegante y sutil, en hueso oscuro o gris claro. Sustituye a la «perilla» deslizante del apartado anterior.
- `visor360.js?v=7` / `visor360.css?v=5` / `polos.js?v=73`: una sola fila bajo la foto, de 50 px de alto: FRENTE · ‹ rueda › · ESPALDA. La rueda se dibuja en un canvas de 24 px de alto (muescas finas que se juntan hacia los bordes, como un cilindro) dentro de una zona táctil de 44 px; 14 px de rueda = 1 cuadro; gira sin tope en ambos sentidos y en el mismo sentido que arrastrar el polo. Al abrir hace un leve vaivén de 0,9 s para invitar a usarla (se omite con «reducir movimiento»). Accesible: `role="slider"`, flechas, Inicio/Fin.
- Comprobado en pestaña propia con arrastres y clics reales a 390 y 320 px: más de una vuelta seguida a cada lado, atajos Frente/Espalda, flechas, polo arrastrable, control debajo de la foto (medido), sin desbordes ni errores de consola. 27/27 pruebas, build regenerado.
- Sin probar: dedo real en un teléfono, Safari/Firefox.

## Actualización 19/11/2026 (reservas BA-2ac4e4fe8553 y BA-ef2754821f1f): lote completo, 18 polos × hombre y mujer
- Rama `claude/polos-360-lote-20261118` desde `origin/main` 885ba0b9. Lote de 36 secuencias (talla M, color de la web) hecho con
  `scripts/visor360/regenerar_360.py` de Estampados; 36/36 sin fallas ni avisos. Solo entran polos LISTOS en Estampados
  (`polo_listo.estado(p, color)["completo"]`, revisado justo antes de integrar: 18/18).
- `polos/vista360/<id>/<revision>/` (≈38 MB en total, ≈1 MB por vista, máx. 1,7 MB) y campo `vista360 {hombre, mujer}` en `polos/data/polos.json`.
  El visor solo se descarga al pulsar «Ver en 360°»; las páginas no pesan más.
- Páginas de polos regeneradas con `build-polos-seo.mjs`; de `build-ai-catalog.mjs` solo se guardan archivos de polos (el resto cambiaba solo por fecha y se deja al CI).
- Móvil: «Frente» y «Espalda» del control ya no se parten en dos líneas (`nowrap`, mismo ancho 76 px); `visor360.css?v=6`.
- Comprobado: 58 pruebas (`polos-seo`, `catalogo-core`, `indexnow`, `polos-vista360`), `audit-seo` sin problemas, desborde móvil 22 páginas × 320/375/414 sin
  problemas, visor abierto en Ikki (hombre y mujer) y Slytherin (320 px), consola sin errores. `validate-feeds` marca la huella de `feed-openai.*`
  solo por los saltos CRLF de esta copia (la huella coincide con el archivo de `main`); no se tocaron esos archivos.
- Hoja de revisión: `D:/CLAUDE CODE/reports/vistas-360-revision/hoja-360-{1,2,3}.jpg`. Publicar solo con OK de Adrián.
