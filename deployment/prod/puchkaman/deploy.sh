#!/usr/bin/env bash
# Puchkaman prod deploy. Image is built in CI and pushed to GHCR; this only
# pulls and (re)starts it. Run on the EC2 box (or via the deploy workflow).
# Public site: no migrations, no .env.production required.
set -euo pipefail
cd "$(dirname "$0")"   # deployment/prod/puchkaman

# CI exports IMAGE_TAG=<commit sha>; manual runs fall back to :latest.
export IMAGE_TAG="${IMAGE_TAG:-latest}"

git -C ../../.. pull --ff-only           # refresh compose/config only — source is in the image

# Private GHCR? Log in first (see tiffin-grab/deploy.sh). Public packages need none.
docker compose pull
docker compose up -d
docker image prune -f
