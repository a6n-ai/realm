#!/usr/bin/env bash
# One-time copy of an app's prod RDS into its Neon project.
#
#   ./deployment/prod/neon-copy.sh <app>      # xplorers | puchkaman | tiffin-grab
#
# Reads prod through the app's tunnel (./deployment/prod/db-tunnel.sh <app>),
# writes only to Neon, prints no secrets. NEON_URL comes from the environment or
# deployment/prod/<app>/.env.neon (gitignored by `.env*`). It must be the DIRECT
# endpoint: pg_restore through the transaction-mode pooler breaks on
# session-level SET statements.
#
# Checks printed for both sides: database size, drizzle migration count + newest
# created_at, and an exact row count for every table. They must match before a
# cutover. See deployment/prod/xplorers/RUNBOOK.md section 6.
set -euo pipefail

app=${1:-}
case $app in
  tiffin-grab) port=5433; region=us-east-1 ;;
  puchkaman)   port=5434; region=us-east-1 ;;
  xplorers)    port=5435; region=ap-southeast-1 ;;
  *) echo "usage: $(basename "$0") <tiffin-grab|puchkaman|xplorers>" >&2; exit 64 ;;
esac

cd "$(dirname "$0")/$app"
[[ -f .env.neon ]] && { set -a; . ./.env.neon; set +a; }
: "${NEON_URL:?set NEON_URL (Neon direct connection string) in the env or deployment/prod/$app/.env.neon}"
[[ $NEON_URL == *-pooler* ]] && { echo "NEON_URL must be the direct endpoint, not -pooler"; exit 1; }

# Passwords travel in PGPASSWORD, never argv, so `ps` on this machine can't see
# them. Assumes the password has no URL-encoded characters (true for RDS hex and
# Neon-generated passwords).
pw()   { sed -E 's#^[^:]+://[^:]+:([^@]+)@.*#\1#' <<<"$1"; }
nopw() { sed -E 's#^([^:]+://[^:@]+):[^@]+@#\1@#' <<<"$1"; }

SRC_FULL=$(aws ssm get-parameter --region "$region" --name "/$app/prod/DIRECT_DATABASE_URL" \
  --with-decryption --query Parameter.Value --output text \
  | sed -E "s#@[^/]+/#@localhost:$port/#; s#sslmode=[a-z-]+#sslmode=require#")
[[ $SRC_FULL == *localhost:$port* ]] || { echo "SSM DIRECT_DATABASE_URL for $app is not an RDS URL (already on Neon?)"; exit 1; }
SRC=$(nopw "$SRC_FULL"); SRC_PW=$(pw "$SRC_FULL"); unset SRC_FULL
DST=$(nopw "$NEON_URL"); DST_PW=$(pw "$NEON_URL"); unset NEON_URL NEON_POOLED_URL

src() { PGPASSWORD=$SRC_PW "$@"; }
dst() { PGPASSWORD=$DST_PW "$@"; }

# Exact per-table counts via one generated query, so the output is the same
# shape on both sides and diffs cleanly.
checks() {
  local run=$1 url=$2
  $run psql "$url" -AtF ' | ' -c "
    select 'db', current_database(), pg_size_pretty(pg_database_size(current_database()));
    select 'migrations', count(*)::text, max(created_at)::text from drizzle.__drizzle_migrations;"
  local q
  q=$($run psql "$url" -At -c "
    select string_agg(format('select %L, count(*)::text from %I.%I', schemaname||'.'||tablename, schemaname, tablename), ' union all ' order by schemaname, tablename)
    from pg_tables where schemaname not in ('pg_catalog','information_schema')")
  $run psql "$url" -AtF ' | ' -c "$q"
}

WORK=$(mktemp -d); chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

echo "== RDS (source)"; checks src "$SRC" | tee "$WORK/src.txt"

n=$(dst psql "$DST" -Atc "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')")
[[ $n == 0 ]] || { echo "Neon target is not empty ($n tables) - aborting"; exit 1; }

src pg_dump "$SRC" -Fc --no-owner --no-acl -f "$WORK/$app.dump"

rc=0
dst pg_restore --no-owner --no-acl -d "$DST" "$WORK/$app.dump" || rc=$?

echo "== Neon (target)"; checks dst "$DST" | tee "$WORK/dst.txt"

if (( rc != 0 )); then
  echo "!! pg_restore failed (exit $rc) - NOT ready for cutover. Reset the Neon branch and rerun." >&2
  exit "$rc"
fi
# Size differs after a restore; everything else must be identical.
if diff <(grep -v '^db |' "$WORK/src.txt") <(grep -v '^db |' "$WORK/dst.txt"); then
  echo "MATCH: migrations and every table's row count are identical"
else
  echo "!! MISMATCH above - NOT ready for cutover" >&2
  exit 1
fi
