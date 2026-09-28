#!/usr/bin/env bash
# Launch reset (docs/plans/2026-09-27-tiffin-grab-launch-db-reset.md): save tiffin-grab's
# setup data from the old DB, then load it into the freshly migrated baseline.
#
#   ./launch-setup-data.sh save <db-url> <dir>   # read-only session, one CSV per table
#   ./launch-setup-data.sh load <db-url> <dir>   # one transaction, refuses a non-empty DB
#
# Kept: catalog, delivery config, app settings, email templates, static files, marketing
# lists/campaigns, the email suppression list, and staff (non-customer users, their
# credentials and org membership). Everything tied to a customer, plus menus, is left
# behind. No kept table has a foreign key to a dropped one.
#
# Save and load must see the same schema: deploy main (prod on the last pre-squash
# migration) before saving. A column mismatch fails the load and rolls it all back.
set -euo pipefail

# Load order = foreign-key order. "table|filter" keeps only matching rows.
TABLES=(
  "app"
  "organization"
  "plans"
  "dish_categories"
  "addon_categories"
  "lead_sources"
  "meal_sizes"
  "duration_packages"
  "delivery_strategy_groups"
  "delivery_strategy_connections"
  "delivery_strategies"
  "delivery_types"
  "delivery_zones"
  "address_tags"
  "users|role <> 'user'"
  "account|user_id in (select id from users where role <> 'user')"
  "member|user_id in (select id from users where role <> 'user')"
  "meal_size_items"
  "dishes"
  "category_plans"
  "category_swap_pairs"
  "dish_category_addon_categories"
  "meal_rules"
  "meal_rule_conditions"
  "meal_payout"
  "pricing_tiers"
  "delivery_frequencies"
  "discounts"
  "delivery_zone_types"
  "delivery_charge_configs"
  "coin_rate"
  "feature_flags"
  "lead_subsources"
  "event_payout"
  "notification_template"
  "public_faqs"
  "files_file_system|resource_type = 'static'"
  "contact_list"
  "contact_list_member"
  "campaign"
  "campaign_content"
  "message_suppression"
)

cmd="${1:-}"; url="${2:-}"; dir="${3:-}"
[[ "$cmd" =~ ^(save|load)$ && -n "$url" && -n "$dir" ]] || { sed -n '5,6p' "$0"; exit 2; }

if [[ "$cmd" == save ]]; then
  mkdir -p "$dir"; : > "$dir/_counts"
  for entry in "${TABLES[@]}"; do
    table="${entry%%|*}"; filter="true"; [[ "$entry" == *"|"* ]] && filter="${entry#*|}"
    # Ordered by id so self-referencing rows (files parent_id) load parent-first.
    PGOPTIONS="-c default_transaction_read_only=on" psql "$url" -q -v ON_ERROR_STOP=1 \
      -c "\\copy (select * from public.$table where $filter order by id) to '$dir/$table.csv' csv header"
    # Counted in SQL: CSV lines lie when a value holds newlines (email template HTML).
    n=$(PGOPTIONS="-c default_transaction_read_only=on" psql "$url" -tAc "select count(*) from public.$table where $filter")
    echo "$table $n" >> "$dir/_counts"
    printf '%-32s %s\n' "$table" "$n"
  done
  exit 0
fi

rows=$(psql "$url" -tAc "select (select count(*) from public.app) + (select count(*) from public.users)")
[[ "$rows" == 0 ]] || { echo "refusing: target already has app/users rows ($rows). Load only into a fresh baseline."; exit 1; }

script="$(mktemp)"; trap 'rm -f "$script"' EXIT
for entry in "${TABLES[@]}"; do
  table="${entry%%|*}"; file="$dir/$table.csv"
  [[ -f "$file" ]] || { echo "missing $file"; exit 1; }
  cols="$(head -1 "$file" | sed 's/[^,]*/"&"/g')"
  echo "\\copy public.$table ($cols) from '$file' csv header" >> "$script"
done
psql "$url" -q -1 -v ON_ERROR_STOP=1 -f "$script"

bad=0
while read -r table saved; do
  loaded=$(psql "$url" -tAc "select count(*) from public.$table")
  printf '%-32s saved %-6s loaded %s\n' "$table" "$saved" "$loaded"
  [[ "$saved" == "$loaded" ]] || bad=1
done < "$dir/_counts"
[[ $bad == 0 ]] || { echo "COUNT MISMATCH"; exit 1; }
