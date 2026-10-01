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

# Passwords travel in PGPASSWORD, never argv, so `ps` on this machine can't see
# them. Assumes the password has no URL-encoded characters (true for RDS hex and
# Neon-generated passwords).
pw()   { sed -E 's#^[^:]+://[^:]+:([^@]+)@.*#\1#' <<<"$1"; }
nopw() { sed -E 's#^([^:]+://[^:@]+):[^@]+@#\1@#' <<<"$1"; }

SRC_FULL=$(aws ssm get-parameter --region ap-southeast-1 --name /xplorers/prod/DIRECT_DATABASE_URL \
  --with-decryption --query Parameter.Value --output text \
  | sed -E 's#@[^/]+/#@localhost:5435/#; s#sslmode=[a-z-]+#sslmode=require#')
SRC=$(nopw "$SRC_FULL"); SRC_PW=$(pw "$SRC_FULL"); unset SRC_FULL
DST=$(nopw "$NEON_URL"); DST_PW=$(pw "$NEON_URL"); unset NEON_URL NEON_POOLED_URL

src() { PGPASSWORD=$SRC_PW "$@"; }
dst() { PGPASSWORD=$DST_PW "$@"; }

CHECKS="
  select 'db', current_database(), pg_size_pretty(pg_database_size(current_database()));
  select 'migrations', count(*)::text, max(created_at)::text from drizzle.__drizzle_migrations;
  select 'users', count(*)::text, '' from users;
  select 'session', count(*)::text, '' from session;
  select 'tables', count(*)::text, '' from information_schema.tables where table_schema not in ('pg_catalog','information_schema');"

echo "== RDS (source)"; src psql "$SRC" -AtF ' | ' -c "$CHECKS"

n=$(dst psql "$DST" -Atc "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')")
[[ $n == 0 ]] || { echo "Neon target is not empty ($n tables) - aborting"; exit 1; }

# Prod data on disk: private dir, removed on any exit.
WORK=$(mktemp -d); chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
src pg_dump "$SRC" -Fc --no-owner --no-acl -f "$WORK/xplorers.dump"

rc=0
dst pg_restore --no-owner --no-acl -d "$DST" "$WORK/xplorers.dump" || rc=$?

echo "== Neon (target)"; dst psql "$DST" -AtF ' | ' -c "$CHECKS"

if (( rc != 0 )); then
  echo "!! pg_restore failed (exit $rc) - NOT ready for cutover. Reset the Neon branch and rerun." >&2
  exit "$rc"
fi
echo "restore clean - compare the two blocks before cutover"
