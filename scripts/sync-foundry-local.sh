#!/usr/bin/env bash
# LOCAL DEVELOPMENT ONLY. Realm installs @foundry/* from GitHub tarballs into node_modules/.pnpm.
# Foundry ships raw TypeScript source, so to test realm against an unpushed foundry checkout,
# this copies each foundry package's src/ and package.json over every installed copy.
# CI never uses this (it installs from GitHub). Re-run `pnpm install` to undo.
# Usage: scripts/sync-foundry-local.sh <foundry-checkout-path> [package ...]
set -euo pipefail
shopt -s nullglob

usage() {
  echo "usage: $0 <foundry-checkout-path> [package ...]" >&2
  exit 1
}

[[ $# -ge 1 ]] || usage
FOUNDRY="$(cd "$1" 2>/dev/null && pwd)" || usage
[[ -d "$FOUNDRY/packages" ]] || usage
shift

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ $# -gt 0 ]]; then
  PKGS=("$@")
else
  PKGS=()
  for d in "$FOUNDRY"/packages/*/; do
    PKGS+=("$(basename "$d")")
  done
fi

for p in "${PKGS[@]}"; do
  dirs=("$ROOT"/node_modules/.pnpm/@foundry+"$p"@*/node_modules/@foundry/"$p")
  if [[ ${#dirs[@]} -eq 0 ]]; then
    echo "warn: no installed copy of @foundry/$p, skipping" >&2
    continue
  fi
  for dir in "${dirs[@]}"; do
    rm -rf "$dir/src"
    cp -R "$FOUNDRY/packages/$p/src" "$dir/src"
    cp "$FOUNDRY/packages/$p/package.json" "$dir/package.json"
    echo "updated $dir"
  done
done
