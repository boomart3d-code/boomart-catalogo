# Máscara calavera: segundo modelo

Solicitud de Adrián: incorporar «Máscara calavera con cuernos» a S/150 dentro de la ficha existente, usando las fotos aportadas para el reel. La clásica sigue disponible a S/100.

La ficha conserva el ID `mascara-calavera`. `modelOptions` define nombre, precio oficial y galería por modelo. El selector cambia las fotos y transmite el modelo al carrito y a WhatsApp. El enlace con `?modelo=con-cuernos` abre la segunda opción. Se mantienen los tamaños y la regla de niño ya existente (90 % del precio adulto), sin cambiar precios de otros productos. Los carritos anteriores con `adulto` o `nino` siguen correspondiendo a la máscara clásica.

Fotos originales 1, 2, 3 y 8 de `D:/CLAUDE CODE/CALAVERA CON CUERNOS VIDEOS`; se copian como JPG y se generan WebP livianos, sin modificar la forma o recortar el producto.

Validación: `scripts/test-calavera-models.cjs` comprueba el carrito real, precio adulto S/150, separación de variantes, carritos anteriores, fotos por modelo, cambio de talla, enlace directo y WhatsApp, sin enviar pedidos. Revisión móvil con el comprobador de overflow del repositorio. Las fuentes JS pasan `node --check`.

Incidencia previa ajena: `scripts/test-official-prices.mjs` falla en `pandora-box-caballeros-dorados/null` (400 frente a 40) tanto en este trabajo como en el checkout original sin modificar. No se cambió ese producto ni se ocultó el fallo.

Trabajo aislado en `codex/mascara-calavera-cuernos`; los ocho archivos con cambios locales en el checkout principal se conservaron.
