# Fichas móviles: compartir y WhatsApp accesibles

Pedido urgente de Adrián, 04/11/2026. Responsable: Codex, sesión 01a1a75e-ea51-75c2-8164-c1313fda1ddb.

El tema Galería de Autor reemplazaba el padding inferior reservado para la barra fija del carrito por 32/38 px. Los botones de compartir y WhatsApp quedaban debajo de esa barra, incluso al llegar al límite del scroll. Entre 721 y 1050 px, el contenedor de una columna seguía limitado por la altura del diseño de escritorio y recortaba los detalles.

Se reserva la altura real de la barra mediante ResizeObserver, más 24 px de separación. El tema conserva esa reserva; el área segura y el crecimiento del botón se incluyen en la medición. En tablet y móvil horizontal toda la ficha tiene un solo scroll y el cierre permanece accesible. La apertura de otro producto vuelve al principio. Se incrementaron únicamente las versiones de app.js y boomart-v2.css en portada y campañas.

Validación local final sobre origin/main actualizado: 248 combinaciones de producto/pantalla, incluyendo las 104 fichas a 390×844 y 16 casos representativos en otros nueve tamaños (320 a 1366 px, horizontal incluido). Ninguna acción oculta ni tapada; comprobación real de los puntos pulsables. Barra ampliada y texto aumentado también pasan. Página individual revisada en cada tamaño; compartir genera la URL canónica del producto y WhatsApp contiene la consulta correcta. Compartir: 6/6 escenarios (escritorio, respaldo, error, móvil, cancelar, permiso denegado). Cabecera: 18 recorridos, 0 huecos. Prueba de desbordes en las 103 páginas individuales anteriores, a 320/390 px: 0 problemas. La ficha añadida por otra sesión también pasó las comprobaciones finales de acciones. Captura: mobile-after.png.

El test anterior de compartir buscaba el filtro antiguo oculto: se actualizó para usar el directorio visible de V2. Los cambios de negocio de otras sesiones se conservan al integrar sobre origin/main. No se modifican precios, fotografías, datos de clientes, pagos ni pedidos.

Estado: candidato local validado; publicación y comprobación en vivo pendientes al crear este relevo. El cierre del equipo registra el resultado final y el SHA.
