#!/usr/bin/env bash
# Open a local port onto one app's prod Postgres, via Systems Manager.
#
#   ./deployment/prod/db-tunnel.sh tiffin-grab     # localhost:5433
#   ./deployment/prod/db-tunnel.sh puchkaman       # localhost:5434
#
# No SSH, no .pem, no bastion hop: SSM port-forwards from the app's OWN box, so
# each RDS keeps its security group as-is (5432 reachable only from members of
# that app's SG). Access is an IAM permission per person, revocable without
# touching the box, and every session lands in CloudTrail.
#
# This exists because the alternative — a hand-made SSH tunnel per data source —
# silently pointed tiffin-grab's DataGrip connection at the puchkaman box, whose
# SG the tiffin RDS does not admit. The failure looked like a broken key.
#
# Point IDE data sources at localhost:<port> with NO tunnel configured. A fixed
# port per app is the whole trick: the connection can no longer name one app and
# route through another's network.
#
# Requires on the box: AmazonSSMManagedInstanceCore on its instance role (see
# each app's infra template). Requires locally: the session-manager-plugin
# (brew install --cask session-manager-plugin).
set -euo pipefail

app=${1:-}
if [[ -z $app ]]; then
  echo "usage: $(basename "$0") <app> [local-port]" >&2
  echo "  apps: tiffin-grab (5433), puchkaman (5434)" >&2
  exit 64
fi

# One line per app. A new app gets its own port here — never reuse one, or two
# apps' data sources become indistinguishable at localhost.
case $app in
  tiffin-grab) default_port=5433 ;;
  puchkaman)   default_port=5434 ;;
  *) echo "unknown app: $app" >&2; exit 64 ;;
esac
port=${2:-$default_port}

instance=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=realm-${app}-prod" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)

if [[ -z $instance || $instance == "None" ]]; then
  echo "no running instance tagged Name=realm-${app}-prod" >&2
  exit 1
fi

# Resolved rather than hardcoded: the endpoint changes on a restore or a
# blue/green swap, and a stale hostname here would fail as a timeout, not as a
# clear error.
db_host=$(aws rds describe-db-instances \
  --db-instance-identifier "realm-${app}-prod-db" \
  --query 'DBInstances[0].Endpoint.Address' --output text)

# A box with no SSM registration produces "TargetNotConnected", which reads like
# the instance is down. Say what is actually missing.
if ! aws ssm describe-instance-information \
  --filters "Key=InstanceIds,Values=${instance}" \
  --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null | grep -q Online; then
  echo "warning: ${instance} is not registered with SSM." >&2
  echo "  Attach arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore to its instance role," >&2
  echo "  then give the agent a couple of minutes to register." >&2
fi

echo "${app}: ${db_host}:5432 -> localhost:${port}  (ctrl-c to close)"
exec aws ssm start-session \
  --target "$instance" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=${db_host},portNumber=5432,localPortNumber=${port}"
