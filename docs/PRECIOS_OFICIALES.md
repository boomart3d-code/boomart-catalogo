# Un único precio oficial por producto

Decisión aprobada por Adrián el 17 de octubre de 2026.

- Los importes de venta vigentes pasan a ser los precios oficiales. Hogwarts: S/80.
- `data/products.json` guarda ese único importe en `regularPrice`. Los templos mantienen sus precios por variante en `templePricing`.
- No guardar precio anterior, precio de oferta, bandera de oferta ni porcentajes de rebaja en el catálogo activo. No mostrar tachados ni etiquetas de descuento.
- Fichas, categorías, catálogo para IA, asistente, carrito, seguimiento de eventos y feeds de Meta/Google usan el mismo precio oficial.
- Las referencias a ofertas anteriores se retiran también de las descripciones comerciales activas. Regenerar siempre con `node scripts/build-ai-catalog.mjs`.
- El cupón de bienvenida es un beneficio separado, aplicado en el carrito cuando corresponde; no cambia el precio oficial y no se modifica en esta tarea.
- Ventas, pedidos, abonos, registros de clientes y Git son históricos: no se eliminan ni se reescriben para limpiar el catálogo.
- El registro no se cambia en esta entrega. Cualquier simplificación debe conservar los datos operativos necesarios y requiere aprobación de su flujo antes de implementarse.

Validación: `node scripts/test-official-prices.mjs`.
