#!/usr/bin/env bash
# Prueba la migración del Amigo Secreto por correo (202611260001) en una base DESCARTABLE
# (nunca producción). La aplica dos veces (debe poder repetirse) y corre amigo_secreto.test.sql.
# Requisitos: Docker abierto y la imagen public.ecr.aws/supabase/postgres:17.6.1.166.
set -euo pipefail
export MSYS_NO_PATHCONV=1  # Git Bash en Windows: no convertir /tmp a ruta de Windows
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
NAME="${1:-boomart-sql-test-amigo}"

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test123 public.ecr.aws/supabase/postgres:17.6.1.166 >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
until docker exec "$NAME" pg_isready -U postgres -h localhost >/dev/null 2>&1; do sleep 2; done
sleep 3

FILES=("$ROOT/migrations/202611260001_amigo_secreto.sql" "$HERE/amigo_secreto.test.sql")
cp_in() { if command -v cygpath >/dev/null; then docker cp "$(cygpath -w "$1")" "$NAME:/tmp/$(basename "$1")"; else docker cp "$1" "$NAME:/tmp/$(basename "$1")"; fi; }
for f in "${FILES[@]}"; do cp_in "$f"; done

psql() { docker exec -i "$NAME" psql -U supabase_admin -h localhost -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql -f /tmp/202611260001_amigo_secreto.sql
psql -f /tmp/202611260001_amigo_secreto.sql   # se puede aplicar dos veces
psql -f /tmp/amigo_secreto.test.sql
echo "OK: migración y pruebas del Amigo Secreto"
