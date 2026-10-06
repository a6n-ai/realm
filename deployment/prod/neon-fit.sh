#!/usr/bin/env bash
# Would this app's database sleep on Neon? Read-only.
#
#   ./deployment/prod/db-tunnel.sh tiffin-grab        # in another terminal
#   ./deployment/prod/neon-fit.sh tiffin-grab [hours]  # default 24
#
# Neon bills while its compute is awake and suspends it after 5 idle minutes.
# Every 30s this asks Postgres how long ago any app connection last ran a query,
# then replays Neon's rule over the samples: awake if a query ran in the
# previous 5 minutes. It prints the awake share, the CU-hours a month that
# implies at 0.25 CU, and the Launch-plan cost to compare with RDS.
#
# Prices are the ones used for the 2026-10 decisions (Launch $0.106/CU-hour,
# Free 100 CU-hours per project); check neon.com/pricing before acting on them.
set -euo pipefail

app=${1:-}
hours=${2:-24}
case $app in
  tiffin-grab) port=5433; region=us-east-1 ;;
  puchkaman)   port=5434; region=us-east-1 ;;
  xplorers)    port=5435; region=ap-southeast-1 ;;
  *) echo "usage: $(basename "$0") <tiffin-grab|puchkaman|xplorers> [hours]" >&2; exit 64 ;;
esac

url=$(aws ssm get-parameter --region "$region" --name "/$app/prod/DIRECT_DATABASE_URL" \
  --with-decryption --query Parameter.Value --output text \
  | sed -E "s#@[^/]+/#@localhost:$port/#; s#sslmode=[a-z-]+#sslmode=require#")
[[ $url == *localhost:$port* ]] || { echo "SSM DIRECT_DATABASE_URL for $app is not an RDS URL"; exit 1; }
# Password via env, never argv, so `ps` can't see it.
export PGPASSWORD; PGPASSWORD=$(sed -E 's#^[^:]+://[^:]+:([^@]+)@.*#\1#' <<<"$url")
url=$(sed -E 's#^([^:]+://[^:@]+):[^@]+@#\1@#' <<<"$url")

# Seconds since the most recent statement on any app connection (0 if one is running).
# This script's own session and RDS's rdsadmin are excluded.
probe="select coalesce(min(case when state = 'active' then 0
                                else extract(epoch from now() - state_change)::int end), 99999)
       from pg_stat_activity
       where datname = current_database() and pid <> pg_backend_pid() and usename <> 'rdsadmin'"

samples=$(( hours * 120 ))
out=$(mktemp); trap 'rm -f "$out"' EXIT
echo "sampling $app every 30s for ${hours}h ($samples samples); Ctrl-C (or kill) prints the summary so far"

summary() {
  python3 - "$out" <<'EOF'
import sys
gaps = [int(l) for l in open(sys.argv[1]) if l.strip().lstrip("-").isdigit()]
if not gaps:
    print("no samples"); sys.exit()
# A query happened in the 30s before a sample if its gap is < 30.
busy = [g < 30 for g in gaps]
# Neon: awake while any query ran in the last 5 minutes (10 samples).
awake = [any(busy[max(0, i - 9): i + 1]) for i in range(len(busy))]
share = sum(awake) / len(awake)
cu_hours = share * 730 * 0.25
print(f"samples {len(gaps)} ({len(gaps) / 120:.1f}h), awake {share:.0%} of the time")
print(f"=> ~{cu_hours:.0f} CU-hours/month at 0.25 CU; Free allows 100; Launch ~${cu_hours * 0.106:.2f}/month")
print("longest quiet stretch: %d min" % (max((len(s) for s in "".join("b" if b else "q" for b in busy).split("b")), default=0) // 2))
EOF
}
trap 'echo; summary; exit 0' INT TERM

for ((i = 0; i < samples; i++)); do
  psql "$url" -At -c "$probe" >>"$out" 2>/dev/null || echo 99999 >>"$out"
  sleep 30
done
summary
