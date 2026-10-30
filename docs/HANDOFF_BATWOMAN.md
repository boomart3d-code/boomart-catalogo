# Retirada de la máscara de Batwoman — 30/10/2026

Adrián pidió detener la búsqueda del modelo 3D y eliminar el producto de boomart.pe porque no dispone del archivo imprimible y todavía no lo había vendido.

Se retira `mascara-de-batwoman` de `data/products.json`, de ambas listas de Halloween y de la presentación de Marvel & DC. Se elimina su ficha estática y se regeneran el catálogo, las categorías, los productos relacionados, los feeds y el sitemap. Caché de `app.js` actualizada a v60. Las imágenes originales se conservan.

Validación: 97 → 96 productos; los 96 restantes son idénticos al catálogo base. No queda ficha ni referencia al producto en las fuentes o salidas públicas de texto. Generador, comprobación de sintaxis y diff verificados. El cambio parte de `origin/main` en un worktree separado para conservar los ocho archivos locales modificados del checkout canónico. No se modifica Studio, Biblioteca ni ventas.

Publicación y comprobación final en vivo: registrar resultado y SHA en el relevo BA-a535f52c0f2c del equipo.
