# /polos — vista previa privada (sin publicar)

Web de polos de autor de BoomArt: portada, colección, ficha de producto con galería y zoom, y **probador de modelos**
(el estampado real se pinta en el navegador sobre fotos de personas con polo blanco liso).

## Verla en tu PC
Doble clic en `polos/VER-LOCAL.bat` (o `python -m http.server 8090 --bind 127.0.0.1` en la raíz del repo) y abre
**http://localhost:8090/polos/**. Atajos: `#/p/gryffindor` (ficha), `#/p/leon/probador` (probador).

## Privacidad
- `noindex, nofollow, noarchive` en la página; **ningún enlace** del sitio apunta aquí; no está en `sitemap.xml`, feeds ni catálogo.
- GitHub Pages es público: quien tenga la dirección exacta la ve si se publica. Al lanzar: quitar el `noindex`, agregar al sitemap y al menú.

## Cómo está hecho
- `index.html`, `polos.css`, `polos.js`: sin dependencias. Estilo «Galería de Autor» (marfil + carbón + incisión roja, Barlow Condensed + Inter).
- `data/polos.json`: productos (precio **de prueba**), colores y modelos con la calibración de cada foto (escala px/cm y anclas del estampado).
- `img/`: fotos de modelos (+ `-zoom` 2048 px), máscaras de la prenda, estampados con transparencia y polos tendidos.
- Se regenera con `python scripts/polos/mascaras.py` y `python scripts/polos/construir.py` (leen `D:/BOOMART-ESTAMPADOS`: diseños,
  motor de transparencias y las fotos de Codex en `ARTE/10_fotos-publicitarias`; no tocan los originales ni la paleta real de colores).
- Para sumar modelos: agregar su foto y su máscara, una entrada en `AVATARES`/`TOMAS` de `construir.py` (tono 1-6, cuerpo) y volver a construir.
  El probador ya filtra por género, cuerpo y tono y muestra «el más cercano» si falta una combinación.

## Pendiente
Más modelos (cuerpos y tonos), máscaras definitivas de Codex, fotos de otros colores recoloreadas, carrito/pedido real, precios.
