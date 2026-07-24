#!/usr/bin/env bash
# Puchkaman prod deploy on Box B. Images are built in CI + pushed to GHCR; this
# generates .env.production from SSM (/puchkaman/prod), migrates, then up -d.
# Requires: docker, awscli, jq, the box's instance role (ssm:GetParametersByPath
# on /puchkaman/prod + logs + s3). Run on Box B or via the deploy workflow.
set -euo pipefail
cd "$(dirname "$0")"   # deployment/prod/puchkaman — compose + .env.production live here

SSM_PATH="${SSM_PATH:-/puchkaman/prod}"
SSM_REGION="${SSM_REGION:-us-east-1}"
umask 077
# Single-quote-safe generator (see tiffin-grab/deploy.sh for the full rationale):
# compose $-interpolates unquoted/double-quoted values; only single quotes are
# literal to both the shell `.` and compose's env_file:. A value containing a
# single quote is a hard error, not a silent mis-parse.
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

# Source into the environment so compose can interpolate ${DIRECT_DATABASE_URL},
# ${AWS_REGION}, ${PGBOUNCER_*}, etc.
set -a; . ./.env.production; set +a

export IMAGE_TAG="${IMAGE_TAG:-latest}"

git -C ../../.. pull --ff-only           # refresh compose/config only — source is in the image

docker compose pull                      # pull web + tools images at IMAGE_TAG
docker compose --profile tools run --rm migrate   # drizzle-kit migrate against RDS (direct)
docker compose up -d
docker image prune -af
