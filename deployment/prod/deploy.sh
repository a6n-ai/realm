#!/usr/bin/env bash
# Production deploy. Run on the EC2 box. Requires: docker, a checked-out repo,
# and a filled-in .env.production alongside this file.
set -euo pipefail
cd "$(dirname "$0")"   # deployment/ — compose + .env.production live here

test -f .env.production || { echo "missing .env.production (copy .env.production.example)"; exit 1; }

git -C ../.. pull --ff-only
docker compose build
docker compose --profile tools run --rm migrate   # drizzle-kit migrate against RDS
docker compose up -d
docker image prune -f
