# Design QA · Portada con carrete editorial

## Evidencia

- Referencia anotada por el usuario: `docs/design-reference-portada-carrete-mobile.jpg`
- Implementación móvil, primera foto: `docs/design-qa-portada-carrete-mobile.png`
- Implementación móvil, foto alterna: `docs/design-qa-portada-carrete-mobile-slide2.png`
- Implementación escritorio: `docs/design-qa-portada-carrete-desktop.png`
- Comparación antes/después: `docs/design-qa-comparison-portada-carrete-mobile.jpg`

## Entorno revisado

- Móvil: viewport CSS 390 × 844 px, densidad 1.
- Escritorio: viewport CSS 1440 × 1024 px, densidad 1.
- Contenido real: cuatro fotografías del catálogo y enlaces a sus fichas.

## Comparación visual

El problema señalado queda resuelto: la imagen ya no está contenida dentro de
un rectángulo negro con grandes márgenes. Cada fotografía ocupa a sangre todo
el panel derecho mediante un encuadre centrado y uniforme. El panel crece en
móvil de 116 × 250 px a una columna proporcional de 310 px de alto. La portada
mantiene el titular, la prueba social y “Ver catálogo” en el primer pantallazo,
por lo que la mejora visual no perjudica la función de tienda.

## Interacción y accesibilidad

- Cambio automático cada 5,6 segundos con fundido de 900 ms.
- Cuatro selectores manuales con nombre accesible y estado `aria-pressed`.
- Cada fotografía abre la ficha del producto mostrado.
- Pausa al pasar el cursor o entrar con teclado.
- Navegación con flechas izquierda/derecha.
- Sin animación automática cuando `prefers-reduced-motion` está activo.
- La rotación se detiene cuando la pestaña no está visible.

## Historial de iteraciones

1. Referencia original: producto pequeño, bandas negras y encuadre poco útil.
2. Primera implementación: carrete con fotografías reales a sangre, controles
   y transición automática.
3. Ajuste final: mayor proporción para la fotografía en móvil, recorte centrado,
   controles discretos sobre una placa translúcida y captions solo en escritorio.
4. Verificación: cuatro slides, cambio automático, selección manual, 390 px sin
   desbordamiento global y consola sin errores o advertencias.

## Resultado final

passed
