#!/usr/bin/env bash
# Deploy every app on the box behind the shared Caddy, in order:
#   1. ensure the external `edge` network exists
#   2. bring up the shared proxy (Caddy)
#   3. deploy each app stack (they join `edge`; Caddy picks them up)
# CI forwards IMAGE_TAG=<sha>; manual runs use :latest.
set -euo pipefail
cd "$(dirname "$0")"   # deployment/prod
export IMAGE_TAG="${IMAGE_TAG:-latest}"

docker network inspect edge >/dev/null 2>&1 || docker network create edge

(cd proxy && docker compose pull && docker compose up -d)
(cd tiffin-grab && ./deploy.sh)
