# Códigos cortos y copia rápida · 24/10/2026 · Codex

Pedido autorizado: código más fácil para registros futuros y copia visible junto
al código, conservando WhatsApp y todos los códigos ya emitidos.

- Nuevos códigos: BA- + cinco dígitos aleatorios (incluye ceros iniciales).
- Generador privado con comprobación de existencia, bloqueo transaccional,
  UNIQUE existente y error controlado tras 100 intentos. Espacio de 100.000.
- Migración 202610240003 cambia solo la expresión generadora en las dos funciones
  vigentes mediante pg_get_functiondef; aborta ante fuente no reconocida y no
  actualiza filas. Las validaciones y permisos de los formularios se conservan.
- Copiar junto al código; Clipboard API, alternativa y selección manual con aviso
  honesto si no se permite copiar. WhatsApp se conserva.
- Studio adaptado en PRUEBA y copiado idéntico al real con respaldo en
  _respaldos_despliegue/20261024_codigos_cortos. Cambia regex y tres textos;
  el propietario confirmó reinicio antes de activar el generador nuevo.

Pruebas ya aprobadas: Python 5/5 en PRUEBA; PostgreSQL embebido (solo fixtures):
500 nuevos códigos únicos, formatos viejo/nuevo, idempotencia, colisiones y
permisos; copia normal, fallback y rechazo. Revisión independiente aprobó código
con condición operativa de reiniciar Studio (cumplida por el propietario).
El harness SQL legacy conserva su expectativa antigua porque carga solo las
migraciones originales; test-short-registration.cjs valida específicamente la nueva.

Rollback: revertir frontend y restituir la expresión generadora anterior en ambas
funciones; no renumerar filas ni revertir compatibilidad de Studio con códigos
cortos ya emitidos. No deshacer datos de clientes.
