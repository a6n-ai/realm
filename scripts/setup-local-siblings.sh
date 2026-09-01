#!/usr/bin/env bash
# Clone or update sibling checkouts: $A6N_ROOT/{realm,foundry,relay}
#
# Usage:
#   ./scripts/setup-local-siblings.sh
#   ./scripts/setup-local-siblings.sh --install
#   A6N_ROOT=$HOME/a6n-ai ./scripts/setup-local-siblings.sh --install
#
# If this file lives in a clone named `realm`, the default root is that clone's
# parent (so foundry/ and relay/ land next to it). Otherwise default is ~/a6n-ai.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_REALM="$(cd "$SCRIPT_DIR/.." && pwd)"

INSTALL=0
ROOT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install) INSTALL=1; shift ;;
    --root)
      ROOT="$2"
      shift 2
      ;;
    --root=*)
      ROOT="${1#--root=}"
      shift
      ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$ROOT" ]]; then
  if [[ -n "${A6N_ROOT:-}" ]]; then
    ROOT="$A6N_ROOT"
  elif [[ "$(basename "$SCRIPT_REALM")" == "realm" ]]; then
    ROOT="$(cd "$SCRIPT_REALM/.." && pwd)"
  else
    ROOT="$HOME/a6n-ai"
  fi
fi

github_base() {
  if [[ -n "${A6N_GIT_BASE:-}" ]]; then
    printf '%s\n' "$A6N_GIT_BASE"
    return
  fi
  if git -C "$SCRIPT_REALM" remote get-url origin >/dev/null 2>&1; then
    local url
    url="$(git -C "$SCRIPT_REALM" remote get-url origin)"
    case "$url" in
      git@github.com:a6n-ai/*)
        printf 'git@github.com:a6n-ai\n'
        return
        ;;
      https://github.com/a6n-ai/*|https://x-access-token:*@github.com/a6n-ai/*)
        printf 'https://github.com/a6n-ai\n'
        return
        ;;
    esac
  fi
  printf 'https://github.com/a6n-ai\n'
}

repo_url() {
  local base="$1" name="$2"
  case "$base" in
    git@github.com:a6n-ai) printf 'git@github.com:a6n-ai/%s.git\n' "$name" ;;
    *) printf '%s/%s.git\n' "$base" "$name" ;;
  esac
}

clone_or_update() {
  local name="$1" url="$2" dir="$ROOT/$name"
  if [[ -d "$dir/.git" ]]; then
    echo "==> update $dir"
    git -C "$dir" fetch origin
    git -C "$dir" checkout main
    git -C "$dir" pull --ff-only origin main
  else
    echo "==> clone $url -> $dir"
    git clone "$url" "$dir"
  fi
}

strip_nested_mirrors() {
  local realm="$ROOT/realm"
  for nested in foundry relay; do
    if [[ -e "$realm/$nested" ]]; then
      echo "==> remove leftover nested $realm/$nested (packages install from GitHub)"
      rm -rf "$realm/$nested"
    fi
  done
}

write_workspace() {
  local file="$ROOT/a6n-ai.code-workspace"
  cat >"$file" <<'EOF'
{
  "folders": [
    { "name": "realm", "path": "realm" },
    { "name": "foundry", "path": "foundry" },
    { "name": "relay", "path": "relay" }
  ],
  "settings": {}
}
EOF
  echo "==> wrote $file"
}

mkdir -p "$ROOT"
BASE="$(github_base)"
echo "root: $ROOT"
echo "git:  $BASE"

clone_or_update realm "$(repo_url "$BASE" realm)"
clone_or_update foundry "$(repo_url "$BASE" foundry)"
clone_or_update relay "$(repo_url "$BASE" relay)"
strip_nested_mirrors
write_workspace

if [[ "$INSTALL" -eq 1 ]]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm not found. Enable corepack: corepack enable && corepack prepare pnpm@11.21.0 --activate" >&2
    exit 1
  fi
  for name in realm foundry relay; do
    echo "==> pnpm install ($name)"
    (cd "$ROOT/$name" && pnpm install)
  done
  echo "==> realm git-assert"
  (cd "$ROOT/realm" && node scripts/assert-foundry-from-git.mjs && node scripts/assert-relay-from-git.mjs)
fi

echo
echo "Open the three repos as siblings:"
echo "  $ROOT/a6n-ai.code-workspace"
echo "Realm apps:  cd $ROOT/realm && pnpm dev"
echo "Foundry:     cd $ROOT/foundry && pnpm typecheck"
echo "Relay app:   cd $ROOT/relay && pnpm dev"
