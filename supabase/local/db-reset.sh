#!/usr/bin/env bash
# Recreate a local database from scratch: Supabase shim, migrations, seed.
# Usage: DATABASE_URL=postgres://postgres:postgres@localhost:5432/history_timeline supabase/local/db-reset.sh
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
case "$DATABASE_URL" in
  *supabase.co*|*supabase.com*) echo "Refusing to reset a hosted Supabase database." >&2; exit 1 ;;
esac

root="$(cd "$(dirname "$0")/../.." && pwd)"
db_name="${DATABASE_URL##*/}"; db_name="${db_name%%\?*}"
admin_url="${DATABASE_URL%/*}/postgres"

psql "$admin_url" -v ON_ERROR_STOP=1 -q -c "drop database if exists \"$db_name\" with (force);" -c "create database \"$db_name\";"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$root/supabase/local/00_supabase_shim.sql"
for f in "$root"/supabase/migrations/*.sql; do
  echo "migrate: $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "seed: supabase/seed.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$root/supabase/seed.sql"
echo "done"
