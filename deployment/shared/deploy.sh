#!/usr/bin/env bash
# Deploy shared infra (Redis + RabbitMQ). Run ON the shared box, from this dir.
# Rarely changes — unlike the per-app stacks, this is not on the push path.
#
# One-box mode: brings up both via the umbrella.
# Two-box mode: pass a service dir, e.g. `./deploy.sh redis` on the redis box.
set -euo pipefail
cd "$(dirname "$0")"

test -f .env.shared || { echo "missing .env.shared (copy .env.shared.example)"; exit 1; }

SVC="${1:-}"
if [ -n "$SVC" ]; then
  test -d "$SVC" || { echo "no such service dir: $SVC"; exit 1; }
  docker compose -f "$SVC/docker-compose.yml" --env-file .env.shared up -d
else
  docker compose --env-file .env.shared up -d
fi
docker image prune -f
