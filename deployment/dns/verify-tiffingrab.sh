#!/usr/bin/env bash
# Compare every tiffingrab.ca record on two nameservers before and after moving DNS
# from Hostinger to Route 53 (deployment/dns/route53-tiffingrab.yaml).
#
#   ./verify-tiffingrab.sh <route53-ns> <wordpress-ip> [old-ns]   # old-ns: ns1.dns-parking.com
#
# Exits non-zero on any difference. The website records are checked against what the
# Route 53 zone must serve, not against Hostinger: its apex was a CDN ALIAS whose IPs
# rotate per query. Apex A must be <wordpress-ip>; www must be a CNAME to the apex.
set -euo pipefail

new="${1:?usage: $0 <route53-ns> <wordpress-ip> [old-ns]}"
wp_ip="${2:?usage: $0 <route53-ns> <wordpress-ip> [old-ns]}"
old="${3:-ns1.dns-parking.com}"

RECORDS=(
  "tiffingrab.ca MX" "tiffingrab.ca TXT"
  "app.tiffingrab.ca A" "ftp.tiffingrab.ca A"
  "_dmarc.tiffingrab.ca TXT" "titan1._domainkey.tiffingrab.ca TXT"
  "brevo1._domainkey.tiffingrab.ca CNAME" "brevo2._domainkey.tiffingrab.ca CNAME"
  "sor35gqoewzgywsllpbzakykt3pqyajy._domainkey.tiffingrab.ca CNAME"
  "pa6mtp44zgjhl2pdp3xyyyudcs4dksvr._domainkey.tiffingrab.ca CNAME"
  "5gbh2fe32u6t5gvlgz5ctapoftrc4dyk._domainkey.tiffingrab.ca CNAME"
  "mail.tiffingrab.ca MX" "mail.tiffingrab.ca TXT"
)

# Values only, lower-cased, trailing dots dropped, sorted: TTLs and order may differ.
# A answers keep only the final IPs (www is a CNAME chain whose target changes).
answer() {
  dig +short "$2" "$1" "@$3" | tr 'A-Z' 'a-z' | sed 's/\.$//' \
    | { if [[ "$2" == A ]]; then grep -E '^[0-9.]+$' || true; else cat; fi; } | sort | paste -sd' ' -
}

bad=0
for r in "${RECORDS[@]}"; do
  read -r name type <<< "$r"
  a="$(answer "$name" "$type" "$old")"; b="$(answer "$name" "$type" "$new")"
  if [[ "$a" == "$b" && -n "$b" ]]; then
    printf 'OK    %-60s %s\n' "$name $type" "$b"
  else
    printf 'DIFF  %-60s old=[%s] new=[%s]\n' "$name $type" "$a" "$b"; bad=1
  fi
done

expect() {
  local got; got="$(answer "$1" "$2" "$new")"
  if [[ "$got" == "$3" ]]; then printf 'OK    %-60s %s\n' "$1 $2" "$got"
  else printf 'DIFF  %-60s want=[%s] new=[%s]\n' "$1 $2" "$3" "$got"; bad=1; fi
}
expect tiffingrab.ca A "$wp_ip"
expect www.tiffingrab.ca CNAME tiffingrab.ca
exit $bad
