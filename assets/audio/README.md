# Ambientacion de colecciones

Propuesta local del 3 de noviembre de 2026; pendiente de publicacion.

| Categoria | Audio | Efecto al activar |
| --- | --- | --- |
| Saint Seiya | Pegasus Fantasy, muestra de 60 s proporcionada por Adrian | Meteoros, estrellas, destellos |
| Harry Potter | Hedwig's Theme, John Williams, muestra de 30 s | Varitas, plumas, rayos, chispas y confeti |
| Marvel y DC | The Avengers, Alan Silvestri, muestra de 30 s | Escudos, rayos y estrellas |
| Navidad | Somewhere in My Memory, Home Alone / Mi pobre angelito, John Williams, muestra de 30 s | Copos, estrellas y confeti dorado |
| Cosplay | The Mandalorian, Ludwig Goransson, muestra de 30 s | Cascos, rayos y destellos |
| Mundial de Futbol | Waka Waka (Esto es Africa), Shakira, muestra de 30 s | Balones, estrellas y confeti |
| Macetas | Pokemon Theme, piano de Pokemon / Ed Goldfarb, muestra de 30 s | Hojas y destellos; relacionado con la maceta Pikachu |
| Soportes de Mandos | Cha-La Head-Cha-La, Hironobu Kageyama, instrumental 2005, muestra de 30 s | Mandos, rayos y energia; relacionado con Picoro/Goku |
| Figuras Coleccionables | Super Mario Bros: Theme, London Philharmonic / Andrew Skeet, muestra orquestal de 30 s | Monedas, estrellas y confeti; relacionado con Mario |
| Zelda | Ocarina of Time, cortina de 31 s proporcionada por Adrian | Rupias, triangulos y hojas |

## Procedencia
- `saint-seiya-demo.mp3`: del archivo de Adrian `D:/Videos DE PRODUCTOS PARA LAS REDES/VIDEOS CASAS MINI/banda sonora pegasus fantasy.mp4`, muestra de 60 segundos a 96 kb/s.
- `zelda-demo.mp3`: del archivo `D:/BOOMART-ENTREGAS/zelda-ocarina-of-time-20261028/musica/ocarina-cortina-limpia-31s.wav`, MP3 a 96 kb/s.
- Las ocho muestras nuevas son previews publicas identificadas en Apple iTunes. Metadatos, grabacion, URL original y pagina de la pista en `sources.json`. Son muestras; su disponibilidad publica no acredita licencia de uso comercial.
- Fuentes descargadas conservadas en `D:/BOOMART-ENTREGAS/botoneras-revision-20261103/musica-fuentes/`. Adaptacion mediante ffmpeg-skill audio.py, fundido de entrada 0.2 s y salida 0.6 s. Verificacion JSON en esa carpeta de revision. Las salidas M4A del skill son de aproximadamente 0.9-1 MB; no se afirma que la opcion bitrate 96k haya reducido su bitrate (el skill usa otro valor al exportar audio sin video).

## Comportamiento
- Sin reproduccion ni descarga de musica al entrar; audio `preload=none`, sin src hasta el clic.
- Boton destacado en cabecera y acceso junto a filtros. Ambos indican el mismo estado.
- Una unica pista a la vez, en bucle y volumen inicial 18%. Controles para pausar en cabecera, filtros y control flotante.
- La animacion parte del boton utilizado, no intercepta clics, dura 2000 ms y se elimina. 54 particulas en movil / 88 en escritorio, DPR maximo 1.5; no se generan imagenes o videos para ejecutarla.
- Pausa al cambiar categoria, volver al inicio, abrir carrito, esconder pestaña o salir. Cambio de categoria cancela tambien la animacion y reinicia el tiempo.
- Movimiento reducido: no se muestra lluvia a pantalla completa; la musica puede iniciarse y se da una indicacion suave en el boton.
- Error de audio: mensaje y reintento; los clics rapidos pueden cancelar una carga pendiente.
