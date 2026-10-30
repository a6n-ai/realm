#!/usr/bin/env bash
# Fails when any tracked file still holds a git conflict marker (a merge or stash pop
# committed half-resolved). f5ebef2e6 shipped `<<<<<<< Updated upstream` into
# public-shell.tsx and only the Turbopack build caught it, 3 minutes into deploy.
# `=======` alone is not checked: it is a legal markdown heading underline.
set -euo pipefail

hits=$(git grep -nIE '^(<<<<<<<|>>>>>>>|\|\|\|\|\|\|\|)( |$)' -- . ':!*.patch' ':!*.diff' || true)
if [ -n "$hits" ]; then
  echo "Unresolved merge conflict markers:" >&2
  echo "$hits" >&2
  echo "Resolve them (keep the right side, delete the markers) and commit again." >&2
  exit 1
fi
echo "No conflict markers."
