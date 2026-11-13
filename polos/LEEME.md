# Polos de autor

La colección pública se define en `data/polos.json`. Cada diseño tiene una galería ordenada en `fotos`; la primera foto abre la ficha y se muestra en la colección. `catalogo.local.json` conserva la lista de productos para referencia.

Las imágenes de sesión son composiciones ilustrativas. Cada ficha incluye las referencias a tamaño completo de espalda y pecho. Los archivos anteriores permanecen en el historial y sus imágenes no se usan en esta colección.

Para revisar, ejecuta `python -m http.server 8090 --bind 127.0.0.1` desde la raíz del repo y abre http://localhost:8090/polos/. GitHub Pages publica desde main. La página conserva su URL y la configuración de indexación previa.
