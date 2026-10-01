#!/usr/bin/env bash
# One-time copy of xplorers prod RDS into its Neon project (aged-dust-56644803).
# Reads prod through the tunnel (./deployment/prod/db-tunnel.sh xplorers, port
# 5435), writes only to Neon, prints no secrets. See RUNBOOK.md "Move to Neon".
#
# NEON_URL comes from the environment or from .env.neon next to this script
# (gitignored by `.env*`). It must be the DIRECT endpoint: pg_restore through
# the transaction-mode pooler breaks on session-level SET statements.
set -euo pipefail
cd "$(dirname "$0")"
[[ -f .env.neon ]] && { set -a; . ./.env.neon; set +a; }
: "${NEON_URL:?set NEON_URL (Neon direct connection string) in the env or .env.neon}"
[[ $NEON_URL == *-pooler* ]] && { echo "NEON_URL must be the direct endpoint, not -pooler"; exit 1; }

SRC=$(aws ssm get-parameter --region ap-southeast-1 --name /xplorers/prod/DIRECT_DATABASE_URL \
  --with-decryption --query Parameter.Value --output text \
  | sed -E 's#@[^/]+/#@localhost:5435/#; s#sslmode=[a-z-]+#sslmode=require#')

check() {
  psql "$1" -AtF ' | ' -c "
    select 'db', current_database(), pg_size_pretty(pg_database_size(current_database()));
    select 'migrations', count(*)::text, max(created_at)::text from drizzle.__drizzle_migrations;
    select 'users', count(*)::text, '' from users;
    select 'session', count(*)::text, '' from session;
    select 'tables', count(*)::text, '' from information_schema.tables where table_schema not in ('pg_catalog','information_schema');"
}

echo "== RDS (source)"; check "$SRC"

n=$(psql "$NEON_URL" -Atc "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')")
[[ $n == 0 ]] || { echo "Neon target is not empty ($n tables) - aborting"; exit 1; }

DUMP=$(mktemp -t xplorers).dump
trap 'rm -f "$DUMP"' EXIT
pg_dump "$SRC" -Fc --no-owner --no-acl -f "$DUMP"
pg_restore --no-owner --no-acl -d "$NEON_URL" "$DUMP" || echo "!! pg_restore reported errors above - review before cutover"

echo "== Neon (target)"; check "$NEON_URL"
