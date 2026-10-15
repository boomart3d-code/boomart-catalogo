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
