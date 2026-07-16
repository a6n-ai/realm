#!/usr/bin/env bash
# Production deploy. Images are built in CI and pushed to GHCR; this only pulls
# and starts them. Run on the EC2 box (or via the deploy workflow over SSH).
# Requires: docker, awscli, jq, a checked-out repo (compose + config), and the
# instance role's ssm:GetParametersByPath on $SSM_PATH.
set -euo pipefail
cd "$(dirname "$0")"   # deployment/prod/tiffin-grab — compose + .env.production live here

# Config lives in SSM Parameter Store under /tiffin-grab/prod/, read via the box's
# instance role. .env.production is GENERATED here on every deploy — never hand-edit
# it on the box, it gets overwritten. Change a parameter, re-run this script.
#
# The generated file has TWO parsers: the shell `.` below and compose's env_file:.
# Only single-quoted values are literal to both -- compose $-interpolates unquoted
# and double-quoted values, which would mangle any secret containing a $. jq's @sh
# is NOT usable: its inner-quote escape is a shell-only trick compose reads as a
# literal. So values are wrapped in single quotes (ASCII 39, spelled via explode/
# implode to keep the jq program quote-free) and a value that itself contains one
# is a hard error rather than a silent compose mis-parse.
SSM_PATH="${SSM_PATH:-/tiffin-grab/prod}"
SSM_REGION="${SSM_REGION:-us-east-1}"
umask 077
# Staged via .tmp + mv so a failed fetch cannot leave a truncated .env.production
# behind for a later manual `docker compose up` to source.
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

# Source .env.production into the environment so compose can interpolate
# ${DIRECT_DATABASE_URL}, ${AWS_REGION}, etc. (env_file: only injects into
# containers, not into compose-file substitution).
set -a; . ./.env.production; set +a

# CI exports IMAGE_TAG=<commit sha>; manual runs fall back to :latest.
export IMAGE_TAG="${IMAGE_TAG:-latest}"

git -C ../../.. pull --ff-only           # refresh compose/config only — source is in the image

# Private GHCR? Make the box authenticate before pulling. Simplest is to keep the
# packages PUBLIC (no login needed). To keep them private, put a read:packages
# PAT in ~/.ghcr_token on the box and uncomment:
#   echo "$(cat ~/.ghcr_token)" | docker login ghcr.io -u a6n-ai --password-stdin

docker compose pull                      # pull web + tools images at IMAGE_TAG
docker compose --profile tools run --rm migrate   # drizzle-kit migrate against RDS (direct)
docker compose up -d
# -a, not just dangling: CI deploys with IMAGE_TAG=<commit sha>, so every deploy
# pulls a NEW tag (~1.9GB across web+tools+puchkaman) and the old SHA-tagged images
# stay tagged — invisible to a bare `prune -f`. They also have zero cache value: the
# next deploy's tag is a different SHA. Rollback still works, GHCR keeps every tag.
docker image prune -af
