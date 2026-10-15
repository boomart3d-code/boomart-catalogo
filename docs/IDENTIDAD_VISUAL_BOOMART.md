# Sistema de identidad visual BoomArt

## Propósito

Esta normativa define la firma visual de BoomArt para documentos, pantallas, páginas web, piezas comerciales y comunicaciones. Su objetivo es que una persona pueda reconocer una pieza de BoomArt incluso antes de ver el logotipo.

La identidad combina precisión técnica, acabado artesanal y energía creativa. Debe sentirse profesional y contemporánea, nunca fría; audaz, pero no estridente; especializada, sin parecer complicada.

## Cómo leer esta normativa: dos capas

El sistema tiene **dos capas** que comparten concepto, logo, voz y reglas de
fotografía, pero no los mismos valores de color y tipografía:

| Capa | Dónde se aplica | Fondo | Rojo | Tipografía |
|---|---|---|---|---|
| **Base de marca** | Cotizaciones, notas de venta, PDF, BoomArt Studio, correos, redes | Blanco `#FFFFFF` | Rojo BoomArt `#FF3030` | Una sola familia (Inter o sustituto) |
| **Galería de Autor** | Solo la web `boomart.pe` | Marfil `#F4F0E8` + carbón `#0B0B0B` | Rojo de interfaz `#E1132F` | Barlow Condensed (titulares) + Inter |

Cada pieza usa **una sola capa**: nunca se mezclan los dos rojos ni los dos
fondos en una misma pieza. Cuando una regla general menciona "blanco", "rojo"
o "una familia", en la web se lee como su equivalente de Galería de Autor. Las
excepciones de la web están escritas en su sección; todo lo demás aplica igual
a las dos capas.

## Firma reconocible

Toda pieza de BoomArt debe reunir al menos cuatro de estos seis rasgos:

1. Fondo claro con espacio generoso: blanco en la capa base, marfil en la web.
2. Negro carbón para estructura, títulos y texto principal.
3. Rojo BoomArt usado como acento breve, no como fondo dominante.
4. Títulos compactos y firmes, con jerarquía tipográfica muy marcada.
5. Líneas finas, tablas abiertas y módulos alineados con precisión.
6. Fotografía real del producto como cierre o protagonista, sin decoraciones ficticias.

La repetición consistente de estos rasgos construye reconocimiento sin depender del logo.

## Dirección visual vigente: Galería de Autor

La web adopta la dirección **Galería de Autor** como expresión digital principal
(segunda capa del sistema; ver «Cómo leer esta normativa»).
Debe comunicar arte, exclusividad y valor contemporáneo sin caer en una estética
lujosa genérica. El carácter explosivo de BoomArt se expresa mediante escala,
contraste, composición asimétrica y una incisión roja breve; nunca mediante
llamas, salpicaduras, texturas estridentes o efectos de cómic.

La proporción orientativa en pantalla es 50 % marfil, 38 % carbón, 7 % tonos
neutros y hasta 5 % rojo. El producto real ocupa el lugar de una obra de galería:
fotografía amplia, fondo limpio, información breve y espacio suficiente para que
su forma respire.

### Paleta digital Galería de Autor

| Token | Valor | Uso principal |
|---|---:|---|
| Marfil editorial | `#F4F0E8` | Superficie principal y secciones de catálogo |
| Marfil suave | `#FAF8F3` | Alternancia de secciones y formularios |
| Carbón galería | `#0B0B0B` | Escenarios de producto, cabecera y pie |
| Piedra | `#6F6961` | Metadatos y texto secundario |
| Línea editorial | `#D8D2C9` | Divisores y retícula |
| Rojo de interfaz | `#E1132F` | Acción, incisión gráfica y énfasis puntual |

El rojo integrado en el logotipo oficial no se recolorea. El rojo de interfaz
es un token independiente, calibrado para botones y texto digital; en la web
sustituye al Rojo BoomArt `#FF3030` (no conviven en la misma pantalla).

En la web el carbón sí puede ocupar superficies amplias, pero solo como
escenario de producto, cabecera, pie y tarjetas destacadas; el texto de lectura
y el catálogo se mantienen sobre marfil.

### Tipografía digital

- **Barlow Condensed**, pesos 600 a 900: titulares expresivos, nombres de
  colección y cifras protagonistas.
- **Inter**: navegación, descripciones, precios, formularios y textos de lectura.
- Los titulares pueden ser grandes y compactos; los párrafos mantienen caja
  normal y ancho de lectura moderado.
- Esta combinación de dos familias es una excepción exclusiva de la web. Ambas
  se cargan con un `<link>` en el `<head>` de cada página (no con `@import`
  dentro del CSS, que retrasa la carga y hace parpadear los titulares).

La frase expresiva oficial es **«Arte que toma forma.»**. **«Piezas de autor»**
funciona como firma secundaria para trabajos originales, personalizados o de
edición cuidada; no se usa como una promesa indiscriminada en cada producto.

### Principio comercial irrenunciable

`boomart.pe` es ante todo una **tienda**. La estética Galería de Autor debe
aumentar el valor percibido y facilitar la elección; nunca puede ocultar el
catálogo, los precios, las variantes, la disponibilidad, el carrito o el camino
hacia la compra. Cada decisión visual se evalúa también por su capacidad de:

1. ayudar al visitante a entender rápidamente qué vende BoomArt;
2. permitir explorar, buscar, filtrar y comparar productos sin esfuerzo;
3. mostrar precio, condiciones y acción principal con claridad;
4. mantener siempre accesibles el carrito, WhatsApp y el pedido a medida;
5. reducir pasos y dudas hasta completar la compra o iniciar una consulta.

La fotografía puede sentirse editorial, pero cada producto debe conservar un
nombre legible, un precio visible y una acción inequívoca. Si existe conflicto
entre una composición decorativa y la facilidad de compra, prevalece la
facilidad de compra.

### Lectura para Google y asistentes de IA

La estética nunca puede quitarle a la página lo que Google y los asistentes de
IA necesitan leer:

- El **título principal (H1)** de cada página dice qué vende BoomArt con las
  palabras que la gente busca (por ejemplo, «Figuras coleccionables · Impresión
  3D en Perú»). Los lemas expresivos como «Arte que toma forma.» se muestran
  grandes, pero como texto visual, no como único título.
- No se usa texto oculto para meter palabras clave: todo lo que lee Google
  también lo ve la persona.
- Nombres, precios, descripciones y medidas de cada producto se escriben como
  texto real en la página, nunca solo dentro de una imagen.
- Las fotos llevan texto alternativo descriptivo.

### Fotos completas en la web

Ninguna foto de producto se recorta ni se amplía para llenar un recuadro: se
muestra completa (`object-fit: contain`) y el espacio sobrante se rellena con
carbón o marfil, como el escenario de una galería. Esto incluye carruseles,
portadas y tarjetas. Si un recuadro deja demasiado espacio vacío, se cambia la
foto o el recuadro, no se corta el producto.

## Principios

### El producto es el protagonista

La identidad enmarca el trabajo; no compite con él. Las fotografías deben conservar el color, la textura, las proporciones y las imperfecciones reales del objeto.

### Rojo con intención

El rojo señala marca, acción, estado o cifra importante. No debe ocupar grandes superficies en documentos impresos ni utilizarse como decoración repetitiva.

### Precisión visible

Las alineaciones, columnas, márgenes y ritmos de espacio deben sentirse deliberados. La precisión visual comunica la precisión de fabricación.

### Una sola voz

La web, BoomArt Studio, las cotizaciones, las notas de venta, los correos y las publicaciones deben compartir la misma jerarquía y vocabulario visual.

## Paleta oficial (capa base)

Se usa en documentos, BoomArt Studio, correos y redes. La web usa la paleta
Galería de Autor descrita más arriba.

| Token | Valor | Uso principal |
|---|---:|---|
| Rojo BoomArt | `#FF3030` | Acentos, estados, llamadas a la acción, líneas de cierre |
| Negro BoomArt | `#111111` | Títulos, estructura, divisores principales |
| Carbón | `#2E2E2E` | Texto corrido y datos |
| Gris medio | `#5F5F63` | Información secundaria y metadatos |
| Gris suave | `#F3F4F6` | Fondos auxiliares excepcionales |
| Línea | `#D7DBE0` | Divisores, tablas y contornos sutiles |
| Blanco | `#FFFFFF` | Fondo principal y espacio de respiración |

Regla 70/20/10: aproximadamente 70 % blanco, 20 % negro o grises y hasta 10 % rojo. En documentos impresos, el rojo suele ser menor al 5 %.

No se permiten degradados de marca, rojos alternativos sin función, sombras negras duras ni fondos negros completos en documentos de cliente.

## Tipografía

### Familia

Usar una sans serif geométrica o neo grotesca. Capa base: Inter; sustitutos seguros: Helvetica, Arial o Segoe UI. No mezclar más de una familia en una misma pieza salvo que sea estrictamente técnico. La web es la única excepción (Barlow Condensed + Inter, ver «Tipografía digital»).

### Jerarquía

- Título de documento: 20 a 28 pt, negrita, negro, mayúsculas cuando sea una etiqueta documental corta.
- Título de sección: 10 a 14 pt, negrita, negro, acompañado por una marca roja corta.
- Etiqueta: 7 a 9 pt, negrita, mayúsculas, roja.
- Cuerpo: 9 a 11 pt, regular, carbón.
- Metadato: 7 a 9 pt, regular, gris medio.
- Cifra protagonista: 18 a 28 pt, negrita, negra; cierre inferior rojo.

Las mayúsculas se reservan para categorías breves, estados y títulos documentales. Los párrafos completos siempre se escriben en caja normal.

## Espaciado y retícula

La unidad base es 4 px en pantalla y 2 mm en impresión.

- Espacio mínimo entre bloques: 8 px o 4 mm.
- Espacio recomendado entre secciones: 24 a 32 px o 6 a 8 mm.
- Márgenes A4: 18 mm laterales; 14 mm superior; 22 mm inferior.
- Columnas: alinear etiquetas, cifras y bordes a una retícula común.
- Radios: discretos, entre 6 y 12 px en pantalla; evitar redondeos grandes en documentos.
- Sombras: solo para separar capas interactivas; nunca alrededor del logo o de tablas impresas.

## Composición de documentos comerciales

El orden canónico es:

1. Identidad y tipo de documento.
2. Cliente y proyecto o pedido.
3. Detalle del producto y precios.
4. Cifra principal o resumen financiero.
5. Condiciones, pagos y entrega.
6. Enlaces y contacto.
7. Fotografía real del producto en páginas posteriores, una por producto.

La cabecera se divide en dos zonas de igual ancho: marca a la izquierda y tipo de documento a la derecha. Una línea negra fina cierra la cabecera.

Cada sección comienza con una barra roja corta seguida de un título negro. Las tablas usan encabezados blancos sobre fondo blanco, delimitados por líneas negras; no usan bandas negras de gran tamaño.

La cotización destaca la inversión total. La nota parcial destaca precio final, total abonado y saldo pendiente. La nota final conserva el mismo bloque y muestra saldo cero junto al estado de entrega.

Las tablas comerciales son exclusivamente textuales: producto, cantidad, precios e importes comparten una misma línea base. No se colocan miniaturas dentro de sus celdas. Las fotografías empiezan después del último bloque de texto; cada producto ocupa una página independiente con el rótulo “Foto referencial” y su nombre.

## Logo

- El logotipo oficial es exclusivamente el bloque vertical **BOOM / ART**
  entregado por Adrián. No se redibuja, no se reinterpreta con IA y no se
  sustituye por letras, símbolos de infinito ni monogramas inventados.
- El isotipo pequeño oficial es la bomba circular **BA** entregada el
  14/10/2026. Se reserva para favicon, icono de aplicación y espacios donde el
  logotipo completo perdería legibilidad.
- Usar siempre el archivo con transparencia real y recortado a su contenido.
- Mantener proporción; nunca estirar, comprimir o encerrar en una caja visible.
- Zona de seguridad mínima: la altura de la letra A alrededor del conjunto.
- En fondos claros usar la versión principal. En fondos oscuros, la versión aprobada de alto contraste.
- No agregar sombras, contornos, biseles ni efectos 3D.
- Un formato nuevo se obtiene por exportación mecánica desde los archivos
  oficiales. Cualquier cambio en la geometría o composición requiere la
  aprobación expresa de Adrián.

El logo confirma la autoría, pero no reemplaza al sistema visual. Una pieza que solo “pega el logo” sin respetar color, ritmo y jerarquía no es una pieza BoomArt.

### Isotipo BA · favicon y símbolo compacto

El isotipo compacto oficial se construye con tres significados inseparables:

- **B** de **Boom**.
- **A** de **Art**.
- La silueta de una **bomba**, incluida su mecha, representa la onomatopeya de
  una explosión: **«¡Booom!»**. El conjunto expresa la idea central de
  BoomArt: **arte explosivo**, creatividad con impacto y una pieza capaz de
  irrumpir visualmente.

No es un logo alternativo inventado ni un adorno independiente. Es la síntesis
del nombre y del carácter de la marca para espacios pequeños. Se utiliza como
favicon, icono de aplicación o acceso directo, avatar y sello compacto cuando
el logotipo vertical BOOM / ART perdería legibilidad. Cuando hay espacio
suficiente, el logotipo completo continúa siendo la firma principal.

La B funciona como calado del cuerpo de la bomba; la A roja aporta el acento
BoomArt. En fondos claros se usa la bomba negra y la A roja. En fondos oscuros
se usa la bomba blanca y la misma A roja. El fondo exterior puede ser
transparente; nunca debe aparecer un cuadrado fantasma alrededor.

#### Archivos maestros

Los originales y derivados aprobados están versionados en `assets/brand/`:

- `boomart-icon.svg`: vector principal negro/rojo para fondos claros.
- `boomart-icon-dark.svg`: vector blanco/rojo para fondos oscuros.
- `boomart-favicon-universal.svg`: versión autocontenida para pestañas del
  navegador, con placa blanca tipo *squircle*, bomba negra y A roja.
- `boomart-favicon-transparente-4096.png`: PNG maestro transparente.
- `boomart-favicon-claro-para-fondo-oscuro-4096.png`: PNG maestro de alto contraste.
- `boomart-icon-light-background.png` y
  `boomart-icon-dark-background.png`: aplicaciones cuadradas aprobadas.
- `boomart-icon-original-light.png` y `boomart-icon-original-dark.png`: archivos fuente entregados por
  Adrián; se conservan sin modificación.

El SVG es la fuente preferida para tamaños grandes, impresión y futuras
exportaciones porque escala sin pixelarse. Los PNG 4096 son los másteres raster
para aplicaciones que no admiten SVG.

#### Reglas de aplicación

- Conservar siempre la proporción cuadrada y la geometría original.
- No recortar la mecha, el círculo, la B ni la A.
- No cambiar el grosor, la inclinación, la separación o el cruce de las letras.
- No añadir sombras, biseles, contornos, resplandores, texturas ni efectos 3D.
- No sustituir la bomba por un círculo genérico ni por otro símbolo.
- No agregar palabras dentro del isotipo.
- Usar como mínimo 16 × 16 px; a ese tamaño se utiliza el PNG optimizado.
- Mantener una zona libre aproximada del 8 % alrededor del contenido cuando se
  aplique fuera de un contenedor cuadrado.

#### Jerarquía digital del isotipo

El logotipo vertical BOOM / ART sigue siendo la firma principal en cabeceras de
escritorio, portadas, documentos y piezas con espacio suficiente. El isotipo BA
identifica el sistema BoomArt en espacios compactos o funcionales:

- favicon, acceso directo e icono de aplicación;
- identidad del Asistente BoomArt y sus estados de carga;
- carrito, checkout, cuenta, registro y seguimiento de pedidos;
- confirmaciones y estados emitidos por el sistema;
- firma secundaria del pie de página.

Los iconos funcionales universales conservan su significado: BA no sustituye
búsqueda, carrito, usuario, cerrar ni el símbolo oficial de WhatsApp. No se usa
como viñeta decorativa, no se repite en cada producto y no se superpone sobre
fotografías. El isotipo BA nunca reemplaza al logotipo BOOM / ART ya instalado
en una cabecera o firma principal, tampoco en móvil: solo se añade en espacios
compactos nuevos donde el logotipo completo no había sido la marca existente.

#### Regla específica para la pestaña del navegador

El favicon de la pestaña debe usar la versión **universal autocontenida** con
placa blanca tipo *squircle*, bomba negra y A roja. Es una silueta intermedia:
ni cuadrado ni círculo, con lados reconocibles y curvas amplias como los iconos
de aplicación. El radio oficial es aproximadamente el 28 % del lado. No debe alternarse mediante
`prefers-color-scheme`: el navegador puede mostrar una pestaña activa blanca y
otras negras aunque el sistema continúe en modo oscuro, y esa señal no informa
el color real de cada pestaña. La placa blanca oficial mantiene la bomba y las
dos letras legibles en ambos casos. Las versiones transparentes clara y oscura
se reservan para fondos cuyo color sí controla BoomArt.

El centrado oficial es **óptico respecto del cuerpo esférico de la bomba**. La
mecha no participa en el cálculo: la esfera se centra exactamente en la placa y
el isotipo completo se desplaza aproximadamente un 5 % hacia arriba. No volver
a centrar el conjunto usando sus límites totales, porque eso baja visualmente la esfera.

### Continuidad entre web y todas las piezas BoomArt

La web de BoomArt es la referencia viva de la marca. Toda creación visual
presente o futura —documento, pantalla de Studio, landing, cotización, etiqueta,
publicación, arte comercial o interfaz— debe heredar el mismo concepto y la
misma identidad: fondo claro como espacio principal, negro estructural, un rojo
como acento, tipografía fuerte, precisión de retícula, fotografía real y una
energía visual de **arte explosivo**. Lo que se hereda es el concepto; los
valores exactos de color y tipografía salen de la capa que corresponda a cada
pieza (base o Galería de Autor). No basta con colocar el logo; la pieza
completa debe sentirse parte del mismo sistema que `boomart.pe`.

## Fotografía de producto

El rediseño y sustitución de primeras fotografías de la tienda se rige además
por `docs/SISTEMA_FOTOGRAFICO_PORTADAS_BOOMART.md`, que define familias de
escenarios, encuadres, fidelidad, archivos, control de calidad y publicación.
La fotografía original se conserva como segunda vista; nunca se sobrescribe.

- Mostrar el producto real; no modificar su forma, piezas, acabado ni proporciones.
- Corregir únicamente iluminación, balance de color, encuadre y fondo.
- Preferir fondos neutros, oscuros o contextuales con baja distracción.
- Mantener continuidad de temperatura de color y contraste dentro de una serie.
- No añadir texto dentro de la fotografía para catálogos o documentos.
  Única excepción: las **fotos de medidas** de la galería de cada producto en
  la web (producto con flechas y cotas). Nunca son la foto principal, y las
  mismas medidas también se escriben como texto en la ficha.
- No recortar puntas, base ni elementos que formen parte del producto.
- En documentos, colocar las fotografías en páginas posteriores para que cierren la lectura sin interrumpir datos y precios.
- Usar una fotografía grande por página, completa y sin recorte, identificada con “Foto referencial” y el nombre del producto.

## Iconos e ilustración

Usar iconos simples, monolineales y del mismo grosor. Negro para función, rojo para acción o alerta. No mezclar emojis, iconos rellenos y trazos en una misma interfaz formal.

## Voz escrita

La voz BoomArt es directa, clara y experta. Explica lo necesario sin tecnicismos innecesarios y presenta la impresión 3D desde el resultado que el cliente desea.

- Preferir: “Diseñamos y fabricamos tu pieza a medida”.
- Evitar: “Brindamos soluciones disruptivas de manufactura aditiva”.
- Preferir cifras concretas, plazos verificables y materiales nombrados.
- No prometer exactitud, tiempos o acabados que todavía no estén confirmados.
- Usar “BoomArt” siempre con B y A mayúsculas.

## Accesibilidad y legibilidad

- Contraste mínimo WCAG AA para texto normal.
- Tamaño mínimo impreso: 7 pt solo para metadatos; cuerpo nunca menor de 8.5 pt.
- No comunicar un estado únicamente por color; acompañarlo con texto.
- Enlaces visibles y clicables en PDF; URL completa cuando el documento pueda imprimirse.
- Fotografías con texto alternativo en web.

## Componentes recurrentes

### Encabezado documental

Logo recortado y descriptor a la izquierda. Tipo, número, fecha y estado a la derecha. Línea negra inferior.

### Encabezado de sección

Barra roja de 8 mm por 1.5 mm más título negro en mayúsculas.

### Tabla comercial

Sin fondo oscuro. Línea negra arriba y abajo del encabezado, líneas grises finas entre registros y cifras alineadas a la derecha.

### Resumen financiero

Tres columnas cuando aplique: precio final, total abonado y saldo. Etiqueta roja pequeña, cifra negra grande y línea roja de cierre.

### Botón digital

Primario rojo con texto blanco; secundario gris claro o blanco con borde carbón. Un solo botón primario dominante por vista.

## Reglas por canal

### Web

Aplica la capa Galería de Autor: fondo marfil, navegación y escenarios carbón, botones con el rojo de interfaz, tarjetas limpias, fotografías amplias y completas, y llamadas a la acción concretas. Mantener lectura cómoda en móvil sin desbordamiento horizontal.

### BoomArt Studio

Priorizar densidad operativa y claridad. Usar la misma paleta y jerarquía, pero reservar el rojo para acciones primarias, alertas y estados que requieren atención.

### PDF y documentos impresos

Fondo blanco, bajo consumo de tinta, márgenes constantes, pie discreto y enlaces activos. La identidad proviene de la estructura, no de llenar la página de color.

### Redes sociales

El producto ocupa la mayor parte del cuadro. El rojo aparece en una etiqueta o elemento de marca breve. No saturar con marcos, efectos o múltiples tipografías.

## No hacer

- No usar el logo dentro de un cuadrado blanco o con transparencia mal recortada.
- No cubrir páginas enteras con rojo, ni con negro en documentos (en la web el
  carbón solo como escenario, cabecera y pie).
- No usar más de un rojo de marca en la misma pieza.
- No centrar todos los textos; datos y lectura larga se alinean a la izquierda.
- No usar tablas con cada celda encerrada por bordes gruesos.
- No deformar fotografías ni inventar características del producto.
- No mezclar estilos visuales de distintas colecciones sin una base común.
- No reducir texto para forzar una sola página si pierde legibilidad.

## Lista de control antes de publicar

- ¿La pieza se reconoce como BoomArt aun ocultando el logo?
- ¿El producto es el protagonista?
- ¿El rojo tiene una función clara?
- ¿Las alineaciones siguen una retícula común?
- ¿La jerarquía permite entender el documento en cinco segundos?
- ¿Las cifras importantes se distinguen sin esfuerzo?
- ¿Las fotos son reales y no alteran el producto?
- ¿Los enlaces funcionan y la URL sigue siendo legible al imprimir?
- ¿La versión móvil o A4 está libre de cortes, desbordes y texto diminuto?
- En la web: ¿el H1 dice qué se vende y las fotos de producto se ven completas?

## Gobernanza

Esta es la fuente de verdad visual para BoomArt. Todo componente nuevo debe reutilizar los tokens y patrones aquí definidos antes de crear una excepción. Las excepciones deben documentarse, justificarse por necesidad funcional y conservar la firma reconocible.

Versión 1.1 - 15 de octubre de 2026 (ordena las dos capas, base y Galería de
Autor, sin cambiar la identidad; agrega las reglas de lectura para Google/IA y
de fotos completas).
