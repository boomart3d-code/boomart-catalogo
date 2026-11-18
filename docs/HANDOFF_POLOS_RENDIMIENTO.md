# Polos: carga inicial y rendimiento

Codex · 17/11/2026 Lima · Reserva BA-b6539323062f, sesión codex-polos-rendimiento-20261117. Worktree `D:/BOOMART-ENTREGAS/web-polos-rendimiento-20261117`, rama codex/polos-rendimiento-20261117, base77f13145. Adrián autorizó implementar/publicar: «oka procede con las mejoras que veas necesarias».

## Cambios

- El carrusel conserva el enlace y la imagen inicial del HTML en vez de desmontarlos al terminar de cargar el catálogo. La imagen sigue visible, con prioridad alta y variantes por ancho. Conserva seis fotos,2.5s, botones, pausa, gestos y navegación. Se reutiliza únicamente si el ID y la foto coinciden con la configuración actual.
- `polos/registro-loader.js` descarga Supabase y `src/registro-web.js` al entrar al checkout. Expone temporalmente la interfaz que ya consume checkout.js y luego entrega la API original. Descarga compartida entre peticiones simultáneas, timeout/error recuperable y botón de reintento conservando carrito. Enlaces `?confirmar=` cargan registro para conservar confirmación de correo.
- Las mismas Barlow Condensed500/600/700 e Inter400–700 del proveedor Google Fonts se sirven localmente en WOFF2 latino. `polos/fonts.css`, archivos con huella, fuentes y licencias OFL en `polos/fonts/`. Incluye caracteres de español. También las tres guías usan fuentes locales. Sin solicitud bloqueante a fonts.googleapis.com ni fonts.gstatic.com.
- Código productivo compartido de carrito, checkout, registro, pagos y Supabase sin editar. Se corrigió el contexto simulado de `scripts/test-checkout-two-steps.mjs` (document/classList y polos=false), que tenía dos fallos por no representar esas dependencias existentes. CI ejecuta pruebas de rendimiento y checkout, además de las de SEO.
- HTML Polos y derivados generales regenerados por el constructor existente; no se modifican fuentes de productos3D, precios, reseñas, clientes, ventas o bases de datos. La regeneración general renueva fechas/huellas de los derivados según el comportamiento existente.

## Validación antes de publicar

- 86 pruebas Node correctas,0 fallos. Auditoría local150 páginas/0 errores; feeds0 errores con los2 avisos previos documentados.
- Navegador CUA:26 páginas×320/360/390/414=104 controles sin desbordes.
- Catálogo retenido por interceptación temporal en navegador: primera imagen DOM node53 antes de mejorar y node53 después; carrusel con6 elementos. Interceptación retirada y configuración de tamaño restablecida.
- Prueba aislada en8776 con RPC en memoria, bloqueo de conexiones reales y WhatsApp interceptado: registro ausente al explorar, carga al comprar, Mujer/L S/50, formulario nuevo, entrega recojo, resumen S/50, reserva S/25 y pago total S/50, selección Yape y pedido simulado interceptado. Estado local1 guardado/1 pedido/1 WhatsApp interceptado; ninguna operación real.
- Fallo de descarga de registro provocado con bloqueo temporal: mensaje recuperable; retirada del bloqueo y reintento restablecen formulario. Carrito intacto.
- Evidencias `D:/BOOMART-ENTREGAS/polos-rendimiento-20261117/`: pruebas.txt, auditoria-local.json, movil.json, imagen-conservada.json. Servidores de esta prueba4177 y8776.

## Publicación y medición

Implementación99248e69 publicada en main. Pages44209485678, generador44209485571 e IndexNow44209616638 terminaron completed/success. Auditoría pública150 páginas/0 errores. Nuevos scripts,CSS y cuatro WOFF2 públicos responden200; se conservan seis diapositivas, intervalo2.5s y registro pesado ausente del arranque.

Dos consultas PageSpeed de la URL pública,17/11/2026 19:39 Lima, dispositivo móvil Moto G Power/4G lenta/Lighthouse13.6: **98 rendimiento,100 accesibilidad,100 recomendaciones,100SEO,3/3 navegación con agentes**, en ambas consultas. FCP1.1s,LCP2.3s,TBT10ms,CLS0.011,Speed Index2.7s.

- InformeA: https://pagespeed.web.dev/analysis/https-boomart-pe-polos/inl0aufxly?form_factor=mobile
- InformeB: https://pagespeed.web.dev/analysis/https-boomart-pe-polos/e7sbtjwfbn?form_factor=mobile
- Referencia previa en `docs/HANDOFF_POLOS_VISIBILIDAD.md`: móvil76,FCP1.7s,LCP5.3s,TBT50ms,CLS0. Datos de laboratorio, sujetos a variación. No atribuir CrUX del origen a Polos ni garantizar98 para todas las visitas.

Evidencia final: `pagespeed-98.png`, `pagespeed-a.txt`, `pagespeed-b.txt`, `informes.json`, `portada-publicada.png`, `recursos-publicados.json`, `auditoria-publicada.json` en la carpeta de entregas. Todos los bloqueos/interceptaciones y tamaños temporales del navegador retirados. Permanece abierto el informeA como resultado para Adrián. Sin acciones pendientes del propietario. No se activan anuncios, automatizaciones ni nuevas conexiones.
