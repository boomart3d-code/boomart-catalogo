# Ubicación por IP (DB-IP Lite) — cómo refrescar los datos

Las tablas `geo_ip_pais` y `geo_ip_peru` (Supabase, proyecto `boomart`) se cargaron el 2026-10-14 con
`dbip-country-lite-2026-10` y `dbip-city-lite-2026-10` (https://db-ip.com/db/lite.php, licencia CC BY 4.0;
la atribución va al pie de `/panel/`). Refrescar es **opcional**: el país casi no cambia, y las visitas ya
guardadas conservan el país con el que se registraron.

Pasos (cada mes DB-IP publica archivos nuevos en `https://download.db-ip.com/free/`):

1. Descarga los dos `.csv.gz` (`dbip-country-lite-AAAA-MM` y `dbip-city-lite-AAAA-MM`) en una carpeta vacía.
   Ajusta los nombres de archivo en `preparar_geoip.py` y `validar_geoip.py`.
2. `python -I preparar_geoip.py <carpeta_de_los_gz> <carpeta_salida>` genera 4 CSV compactos.
   `python -I validar_geoip.py <carpeta_de_los_gz> <carpeta_salida>` debe coincidir ≥ 99,9 %.
3. En Supabase (SQL): vaciar y abrir la ventana de carga **temporal**:
   ```sql
   truncate public.geo_ip_pais, public.geo_ip_peru;
   grant insert on public.geo_ip_pais, public.geo_ip_peru to anon;
   create policy geo_carga_temporal_pais on public.geo_ip_pais for insert to anon with check (true);
   create policy geo_carga_temporal_peru on public.geo_ip_peru for insert to anon with check (true);
   ```
4. `python -I cargar_geoip.py <carpeta_salida> ../src/supabase-config.js 5000` (≈ 2 min, lotes de 5.000 filas).
5. **Cerrar la ventana de inmediato** y comprobar los conteos:
   ```sql
   drop policy geo_carga_temporal_pais on public.geo_ip_pais;
   drop policy geo_carga_temporal_peru on public.geo_ip_peru;
   revoke all on public.geo_ip_pais, public.geo_ip_peru from anon, authenticated;
   analyze public.geo_ip_pais; analyze public.geo_ip_peru;
   select (select count(*) from public.geo_ip_pais), (select count(*) from public.geo_ip_peru);
   ```
   Durante la carga, `track` sigue funcionando (si la búsqueda falla, la visita se guarda sin ubicación).

La IP del visitante nunca se guarda: `track` la usa en memoria para llamar a `geo_ip()`.
