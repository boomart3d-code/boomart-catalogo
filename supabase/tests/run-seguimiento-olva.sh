#!/usr/bin/env bash
# Prueba el paso «Enviado por Olva» del seguimiento público (migración 202611220003) en una
# base DESCARTABLE (nunca producción): crea la tabla con el esquema anterior, aplica la
# migración (dos veces) y comprueba qué se acepta y qué se sigue rechazando.
set -euo pipefail
export MSYS_NO_PATHCONV=1
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
NAME="${1:-boomart-sql-test-seg}"
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test123 public.ecr.aws/supabase/postgres:17.6.1.166 >/dev/null
until docker exec "$NAME" pg_isready -U postgres -h localhost >/dev/null 2>&1; do sleep 2; done
sleep 3
psql() { docker exec -i "$NAME" psql -U supabase_admin -h localhost -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

# Esquema ANTERIOR (el de producción hoy): las dos listas sin Olva.
git -C "$ROOT" show HEAD:supabase/schema_seguimiento.sql > /tmp/schema_antes.sql 2>/dev/null || cp "$ROOT/schema_seguimiento.sql" /tmp/schema_antes.sql
sed -i "s/'enviado_shalom', 'enviado_olva', 'cerrado'/'enviado_shalom', 'cerrado'/; s/('local', 'recojo', 'shalom', 'olva')/('local', 'recojo', 'shalom')/" /tmp/schema_antes.sql
docker cp "$(cygpath -w /tmp/schema_antes.sql)" "$NAME:/tmp/schema_antes.sql"
docker cp "$(cygpath -w "$ROOT/migrations/202611220003_seguimiento_olva.sql")" "$NAME:/tmp/mig.sql"
docker cp "$(cygpath -w "$ROOT/schema_seguimiento.sql")" "$NAME:/tmp/schema_nuevo.sql"
psql -f /tmp/schema_antes.sql

echo "== antes de la migración: Olva se rechaza"
psql <<'SQL'
do $$ begin
  begin insert into public.seguimiento_pedidos(venta_id, etapa, metodo_envio) values (1, 'listo_envio', 'olva'); raise exception 'debió rechazar método olva';
  exception when check_violation then raise notice 'ok: método olva rechazado antes'; end;
  begin insert into public.seguimiento_pedidos(venta_id, etapa, metodo_envio) values (2, 'enviado_olva', 'local'); raise exception 'debió rechazar etapa enviado_olva';
  exception when check_violation then raise notice 'ok: etapa enviado_olva rechazada antes'; end;
  insert into public.seguimiento_pedidos(venta_id, etapa, metodo_envio) values (3, 'enviado_shalom', 'shalom'), (4, 'listo_envio', 'local');
end $$;
SQL

# Permisos antes de la migración (en la imagen de pruebas anon puede traer permisos por defecto:
# lo que importa es que la migración NO los cambie).
psql -c "create table public._permisos_antes as select r, has_table_privilege(r, 'public.seguimiento_pedidos', 'select,insert,update,delete') as p from unnest(array['anon','authenticated','service_role']) r;"

echo "== migración x2"
psql -f /tmp/mig.sql
psql -f /tmp/mig.sql

echo "== después de la migración"
psql <<'SQL'
do $$ declare n int; begin
  insert into public.seguimiento_pedidos(venta_id, etapa, metodo_envio, direccion_envio) values (10, 'enviado_olva', 'olva', 'Agencia Olva: X');
  insert into public.seguimiento_pedidos(venta_id, etapa, metodo_envio) values (11, 'listo_envio', 'olva');
  update public.seguimiento_pedidos set metodo_envio = 'olva', etapa = 'enviado_olva' where venta_id = 4;
  assert (select count(*) from public.seguimiento_pedidos where metodo_envio = 'olva') = 3, 'acepta método olva';
  assert (select etapa from public.seguimiento_pedidos where venta_id = 3) = 'enviado_shalom', 'Shalom intacto';
  begin insert into public.seguimiento_pedidos(venta_id, etapa, metodo_envio) values (20, 'enviado_dhl', 'local'); raise exception 'debió rechazar etapa desconocida';
  exception when check_violation then null; end;
  begin insert into public.seguimiento_pedidos(venta_id, etapa, metodo_envio) values (21, 'tomado', 'dhl'); raise exception 'debió rechazar método desconocido';
  exception when check_violation then null; end;
  select count(*) into n from pg_constraint where conrelid = 'public.seguimiento_pedidos'::regclass and conname in ('seguimiento_pedidos_etapa_check','seguimiento_pedidos_metodo_envio_check');
  assert n = 2, 'una sola restricción de cada tipo';
  assert not exists (select 1 from public._permisos_antes a where a.p is distinct from has_table_privilege(a.r, 'public.seguimiento_pedidos', 'select,insert,update,delete')), 'los permisos de la tabla no cambian';
  raise notice 'ok: Olva aceptado, Shalom intacto, valores desconocidos rechazados, permisos sin cambio';
end $$;
SQL
echo "== el esquema declarativo nuevo se aplica limpio en una base vacía"
psql -c "drop table public.seguimiento_pedidos;" && psql -f /tmp/schema_nuevo.sql
psql -c "insert into public.seguimiento_pedidos(venta_id, etapa, metodo_envio) values (99, 'enviado_olva', 'olva');"
docker rm -f "$NAME" >/dev/null 2>&1 || true
echo "== TODAS LAS PRUEBAS PASARON =="
