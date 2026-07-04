#!/usr/bin/env bash
# Production deploy. Images are built in CI and pushed to GHCR; this only pulls
# and starts them. Run on the EC2 box (or via the deploy workflow over SSH).
# Requires: docker, a checked-out repo (for compose + config), and a filled-in
# .env.production alongside this file.
set -euo pipefail
cd "$(dirname "$0")"   # deployment/prod — compose + .env.production live here

test -f .env.production || { echo "missing .env.production (copy .env.production.example)"; exit 1; }

# Source .env.production into the environment so compose can interpolate
# ${DIRECT_DATABASE_URL}, ${AWS_REGION}, etc. (env_file: only injects into
# containers, not into compose-file substitution).
set -a; . ./.env.production; set +a

# CI exports IMAGE_TAG=<commit sha>; manual runs fall back to :latest.
export IMAGE_TAG="${IMAGE_TAG:-latest}"

git -C ../.. pull --ff-only              # refresh compose/config only — source is in the image

# Private GHCR? Make the box authenticate before pulling. Simplest is to keep the
# packages PUBLIC (no login needed). To keep them private, put a read:packages
# PAT in ~/.ghcr_token on the box and uncomment:
#   echo "$(cat ~/.ghcr_token)" | docker login ghcr.io -u a6n-ai --password-stdin

docker compose pull                      # pull web + tools images at IMAGE_TAG
docker compose --profile tools run --rm migrate   # drizzle-kit migrate against RDS (direct)
docker compose up -d
docker image prune -f
