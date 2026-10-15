# QA visual y de accesibilidad — formularios claros

Fecha: 2026-10-15

## Alcance

- Formulario de pedido personalizado.
- Formulario de opiniones y selector de puntuación.
- Vista móvil y escritorio sobre superficies blancas/marfil.

## Verificaciones

| Comprobación | Resultado |
| --- | --- |
| Texto principal `#514c46` sobre marfil `#faf8f3` | 8.00:1 — supera WCAG 2.1 AA |
| Texto auxiliar `#514c46` sobre blanco | 8.49:1 — supera WCAG 2.1 AA |
| Enlace `#9a271f` sobre blanco | 7.82:1 — supera WCAG 2.1 AA |
| Estrellas sin marcar | Contorno `☆` gris oscuro, visible sobre blanco |
| Estrellas marcadas | Forma rellena `★` y color rojo BoomArt |
| Estado sin depender solo del color | Sí: forma hueca/rellena y `aria-checked` |
| Área táctil por estrella | 44 × 44 px |
| Operación con teclado | Flechas izquierda/derecha actualizan la selección |
| Desbordamiento horizontal en móvil | No detectado |
| Errores o advertencias en consola | Ninguno |

## Evidencia

- `docs/design-qa-legibilidad-formularios.png`

Resultado final: aprobado.

## Seguimiento — colección, contraste y cupón

Fecha: 2026-10-15

| Comprobación | Resultado |
| --- | --- |
| Tarjeta «Para empresas» | Arte corporativo propio, encuadre vertical completo y sin área vacía |
| Peso del arte servido | 106 KB en WebP; se conserva el PNG maestro de alta resolución |
| Texto informativo de «Encuentra lo que buscas» | `#514c46` sobre marfil `#faf8f3`: 8.00:1 — supera WCAG 2.1 AA |
| Permanencia legible del cupón | 2,6 segundos antes de iniciar el recorrido; se pausa al mantener cursor o foco sobre él |
| Recorrido del cupón | 950 ms, visible hasta la etiqueta permanente «Reclama 10% de bienvenida» |
| Movimiento reducido | Se mantiene el tiempo de lectura y se evita la trayectoria animada |
| Sintaxis JavaScript | `node --check src/app.js` aprobado |

Evidencia:

- `docs/design-qa-coleccion-empresas.png`
- `docs/design-qa-cupon-legible.png`

Resultado final: aprobado.
