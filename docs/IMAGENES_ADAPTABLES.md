# Fotos ligeras para boomart.pe

31/10/2026 · Codex · BA-b3a1a26b039c.

## Comportamiento

Las fotos originales de `assets/products` y `assets/hero` se conservan. `scripts/build-responsive-images.mjs` crea derivados WebP de 120, 360, 720 y 1200 px de ancho, solo si son menores que el original, sin recortar ni agrandar. La URL de cada derivado contiene el hash de su fuente; una foto nueva no reutiliza el cache de la anterior.

`assets/responsive/manifest.json` y `src/image-sources.js` describen los anchos reales. `src/responsive-images.js` comparte la seleccion entre la tienda y el generador HTML: miniaturas, tarjetas, portada y foto principal tienen `srcset`/`sizes` propios; el original queda como opcion de mayor resolucion. Cambiar una skin o una foto actualiza tambien el srcset, sin conservar la imagen anterior. Las fotos sin derivados mantienen su URL.

El generador `scripts/responsive-html.mjs` aplica las fotos adaptables desde el HTML, sin esperar a JavaScript. Los helpers se cargan antes de app.js y de los controles de las fichas. El catalogo de fuentes tiene version de cache calculada por contenido. El carrusel solo prepara la activa y sus vecinas; pausa el avance automatico con ahorro de datos, conexiones declaradas lentas y cuando deja de verse. Los controles manuales siguen disponibles.

## Actualizar fotos

```
node scripts/build-responsive-images.mjs
node scripts/build-ai-catalog.mjs
node --test scripts/responsive-images.test.mjs
```

Hace falta Sharp para generar derivados, instalado normalmente con `npm install --no-save sharp`; en esta PC se puede reutilizar la instalacion canonica ya existente. El generador de catalogo no requiere Sharp. GitHub Actions ejecuta la generacion de tamaños antes de las paginas y guarda tambien los derivados y el catalogo de fuentes. No editar los manifiestos a mano. Los derivados existentes son reutilizados; no se borran versiones antiguas automaticamente.

## Validacion previa a publicar

- 431 fuentes, 1391 derivados; originales sin modificaciones.
- 107 paginas de producto/categoria, 11060 referencias de imagen comprobadas: 0 archivos faltantes.
- 107 paginas × anchos 320/360/390/414: 0 desbordamientos.
- Cabecera: 13 comprobaciones, 0 huecos.
- 23 opciones Zelda comprobadas con sus imagenes adaptables.
- 16 pruebas de imagenes, checkout y fechas de video aprobadas.
- Datos del catalogo, precios, pedidos y clientes sin modificaciones.

## Publicacion y medicion posterior

Codigo publicado en main: `5db213b99bc44277e3951d09fb026c3d2c95cbb1`. GitHub Actions del catalogo y despliegue de Pages terminaron correctamente. HTML publico incluye srcset y helpers; muestras de derivados y scripts dan HTTP200, con los scripts comprimidos con gzip. Consola de la comprobacion publica sin errores.

Condiciones antes/despues: navegador de 390 px, DPR1, limite de descarga 1.6 Mbps, latencia configurada 150 ms, cache desactivada. Se cuenta el peso de recursos del propio dominio, no el de servicios externos. No equivale a una medicion de usuarios reales ni promete esos tiempos en cualquier telefono.

| Medicion | Antes | Despues |
|---|---:|---:|
| Portada, recursos propios | 2591 KiB | 537 KiB |
| Portada, imagenes | 2483 KiB | 413 KiB |
| Portada, evento load | 13.9 s | 5.1 s |
| Ficha Zelda, recursos propios | 1921 KiB | 156 KiB |
| Ficha Zelda, imagenes | 1885 KiB | 105 KiB |
| Ficha Zelda, evento load | 11.8 s | 2.9 s |
| Descarga foto principal Zelda | 10.4 s | 1.9 s |

Reduccion de peso observado: portada79 %, ficha Zelda92 %. El contenido de texto ya aparecia pronto antes (FCP1.46s en portada, .92s en ficha); no se afirma una mejora de FCP, que en esta medicion fue1.54s y1.09s. La mejora comprobada es la descarga de fotos y carga total, manteniendo imagenes grandes disponibles.

Evidencia: `docs/performance-20261031/mediciones.json` y `web-publicada.png`. La carpeta de trabajo que se publico es `D:/BOOMART-ENTREGAS/web-daredevil-20261028`, rama `codex/imagenes-adaptables-20261031`. El checkout canonico conserva sus cambios ajenos, sin pull ni sobrescrituras; para retomar, partir de origin/main actualizado en un checkout limpio.
