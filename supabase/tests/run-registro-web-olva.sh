#!/usr/bin/env bash
# Prueba «Envío por Olva» del registro de la tienda (migración 202611220002) en una base
# DESCARTABLE (nunca producción): arma el esquema con schema.sql y las migraciones del
# registro, corre las pruebas vigentes de registro_web y luego las de Olva.
# Requisitos: Docker abierto y la imagen public.ecr.aws/supabase/postgres:17.6.1.166.
set -euo pipefail
export MSYS_NO_PATHCONV=1  # Git Bash en Windows: no convertir /tmp a ruta de Windows
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
NAME="${1:-boomart-sql-test-web}"

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test123 public.ecr.aws/supabase/postgres:17.6.1.166 >/dev/null
until docker exec "$NAME" pg_isready -U postgres -h localhost >/dev/null 2>&1; do sleep 2; done
sleep 3

FILES=(
  "$ROOT/schema.sql"
  "$ROOT/migrations/202610110001_recordatorios_registro.sql"
  "$ROOT/migrations/202610140001_registro_clientes.sql"
  "$ROOT/migrations/202610140002_registro_clientes_endurecer.sql"
  "$ROOT/migrations/202610150001_registro_web.sql"
  "$ROOT/migrations/202611220001_registro_cliente_olva.sql"
  "$ROOT/migrations/202611220002_registro_web_olva.sql"
  "$HERE/registro_web.test.sql"
  "$HERE/registro_web_olva.test.sql"
)
for f in "${FILES[@]}"; do docker cp "$(cygpath -w "$f")" "$NAME:/tmp/$(basename "$f")"; done

psql() { docker exec -i "$NAME" psql -U supabase_admin -h localhost -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

# En Supabase real auth.jwt() lo crea GoTrue y panel_es_admin() el portal; aquí se definen
# igual para la base descartable.
psql <<'SQL'
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create or replace function public.panel_es_admin() returns boolean language sql stable set search_path = '' as $$
  select false;
$$;
SQL

for f in schema.sql 202610110001_recordatorios_registro.sql 202610140001_registro_clientes.sql \
         202610140002_registro_clientes_endurecer.sql 202610150001_registro_web.sql; do
  echo "== $f"; psql -f "/tmp/$f"
done

echo "== antes de la migración: Olva se rechaza"
psql <<'SQL'
do $$ begin
  perform public.registro_web_guardar(repeat('x', 64), jsonb_build_object('full_name', 'Antes Olva', 'phone', '933444555',
    'email', 'antes@ejemplo.com', 'document_type', 'dni', 'document_number', '55667788', 'delivery_method', 'olva'), '');
  raise exception 'debió rechazar olva antes de la migración';
exception when sqlstate '22023' then raise notice 'ok: olva rechazado antes de la migración';
end $$;
SQL

for f in 202611220001_registro_cliente_olva.sql 202611220002_registro_web_olva.sql 202611220002_registro_web_olva.sql; do
  echo "== $f"; psql -f "/tmp/$f"
done

echo "== pruebas vigentes de registro_web (deben seguir pasando)"
printf 'begin;\n\\i /tmp/registro_web.test.sql\nrollback;\n' | psql
echo "== pruebas de Olva"
printf 'begin;\n\\i /tmp/registro_web_olva.test.sql\nrollback;\n' | psql
echo "== TODAS LAS PRUEBAS PASARON =="
