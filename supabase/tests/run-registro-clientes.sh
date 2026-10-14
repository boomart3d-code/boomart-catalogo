#!/usr/bin/env bash
# Corre supabase/tests/registro_clientes.test.sql en una base DESCARTABLE (nunca producción).
# Requisitos: Docker abierto y la imagen public.ecr.aws/supabase/postgres:17.6.1.166 (ya existe en esta PC).
set -euo pipefail
export MSYS_NO_PATHCONV=1  # Git Bash en Windows: no convertir /tmp a ruta de Windows
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
NAME="${1:-boomart-sql-test}"

if ! docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test123 public.ecr.aws/supabase/postgres:17.6.1.166 >/dev/null
  until docker exec "$NAME" pg_isready -U postgres -h localhost >/dev/null 2>&1; do sleep 2; done
  sleep 3
fi

docker cp "$(cygpath -w "$ROOT/migrations/202610140001_registro_clientes.sql")" "$NAME:/tmp/202610140001_registro_clientes.sql"
docker cp "$(cygpath -w "$ROOT/migrations/202610140002_registro_clientes_endurecer.sql")" "$NAME:/tmp/202610140002_registro_clientes_endurecer.sql"
docker cp "$(cygpath -w "$HERE/registro_clientes.test.sql")" "$NAME:/tmp/registro_clientes.test.sql"
docker exec "$NAME" psql -U supabase_admin -h localhost -d postgres -v ON_ERROR_STOP=1 -f /tmp/registro_clientes.test.sql 2>&1
