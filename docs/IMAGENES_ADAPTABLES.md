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

Medicion anterior en navegador (390 px, DPR1, limite 1.6 Mbps/150 ms): recursos propios de portada 2591 KiB, de los cuales 2483 KiB son imagenes; ficha Zelda 1921 KiB, imagenes 1885 KiB. Foto principal Zelda aprox. 10.4 s. Son pruebas de laboratorio, no una promesa para todas las conexiones. El despliegue y las mediciones posteriores se registran tras verificar la web publica.
