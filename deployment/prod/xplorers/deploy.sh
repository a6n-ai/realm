#!/usr/bin/env bash
# Xplorers prod deploy on Box C (ap-southeast-1). Images are built in CI +
# pushed to GHCR; this generates .env.production from SSM (/xplorers/prod),
# migrates, then up -d. Requires: docker, awscli, jq, the box's instance role
# (ssm:GetParametersByPath on /xplorers/prod + logs + ses).
set -euo pipefail
cd "$(dirname "$0")"   # deployment/prod/xplorers

SSM_PATH="${SSM_PATH:-/xplorers/prod}"
SSM_REGION="${SSM_REGION:-ap-southeast-1}"
umask 077
aws ssm get-parameters-by-path --region "$SSM_REGION" --path "$SSM_PATH" \
  --recursive --with-decryption --query 'Parameters[].[Name,Value]' --output json \
  | jq -r '.[]
      | (.[0] | split("/") | last) as $k
      | .[1] as $v
      | ([39] | implode) as $q
      | if ($v | explode | index(39))
        then error("\($k): value contains a single quote, which .env.production cannot represent - change the parameter value")
        else "\($k)=\($q)\($v)\($q)"
        end' > .env.production.tmp
test -s .env.production.tmp || { echo "no parameters under $SSM_PATH in $SSM_REGION"; exit 1; }
mv .env.production.tmp .env.production

set -a; . ./.env.production; set +a

export IMAGE_TAG="${IMAGE_TAG:-latest}"
export COMPOSE_PARALLEL_LIMIT=1

git -C ../../.. pull --ff-only

docker compose pull
docker compose --profile tools pull
docker compose --profile tools run --rm migrate
docker compose up -d
docker image prune -af
