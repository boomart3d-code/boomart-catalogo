# Design QA · Cupón de bienvenida BoomArt

## Objetivo

Convertir el aviso inicial del cupón en una aparición breve, reconocible como
BoomArt y claramente conectada con el botón permanente donde se reclama.

## Evidencia

- Vista móvil durante la aparición: `docs/design-qa-cupon-boomart-mobile.png`.
- Vista de escritorio revisada en el navegador local a 1440 × 1024 px.
- Referencia de marca: `docs/IDENTIDAD_VISUAL_BOOMART.md`.

## Comparación y decisiones

El aviso anterior era una tarjeta dorada con emoji, borde punteado y una salida
genérica hacia arriba. La nueva pieza usa el logotipo oficial, carbón, marfil y
rojo BoomArt; elimina emoji, dorado y decoración ajena al sistema Galería de
Autor. El mensaje se entiende en una lectura: beneficio, porcentaje y acción.

La trayectoria ya no supone una coordenada fija. JavaScript calcula los centros
de la tarjeta y del botón `couponBanner`, por lo que el cupón termina exactamente
en su destino tanto en móvil como en escritorio. Al llegar, el botón recibe un
pulso rojo corto que confirma dónde quedó guardado.

## Comportamiento verificado

- Entrada: 420 ms, con crecimiento breve y estabilización.
- Lectura: 300 ms.
- Recorrido hasta el botón: 430 ms.
- Duración completa aproximada: 1,15 s.
- El fondo se oscurece solo 28 % y no bloquea el resto de la página.
- El clic en la tarjeta completa el vuelo y abre `accountDialog`.
- El botón de destino dice “Regístrate aquí · Reclama 10% de bienvenida”.
- `prefers-reduced-motion` elimina crecimiento, vuelo y pulso.
- Móvil 390 × 844: sin desbordamiento horizontal (`375 = 375`).
- Escritorio 1440 × 1024: sin desbordamiento horizontal (`1425 = 1425`).
- Consola: sin errores ni advertencias.

## Resultado final

final result: passed
