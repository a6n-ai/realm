# Foundry / Relay extraction

Realm **keeps** nested `foundry/` and `relay/` on disk. Do not delete those trees.

Canonical remotes ([a6n-ai/foundry](https://github.com/a6n-ai/foundry), [a6n-ai/relay](https://github.com/a6n-ai/relay)) are mirrors. Most packages still install via `workspace:*`.

## Phases

1. **Nested workspace** — done. `ci` runs Foundry → Relay → apps typecheck.
2. **Git deps, still nested** — done for `@foundry/ai`. It is excluded from the pnpm workspace and installed from `github:a6n-ai/foundry#path:packages/ai`. Nested `foundry/packages/ai` stays as a mirror. Gate: `foundry-ai-git` (green on `main` after `--passWithNoTests`).
3. **Promote export branches, then more git deps (now)** — Realm `foundry-export` / `relay-export` carry CodeQL-safe sources, Foundry package CI, and `--passWithNoTests`. Fast-forward `a6n-ai/foundry` and `a6n-ai/relay` from those branches **before** installing more `@foundry/*` from git (otherwise Realm would pin the stale Foundry tarball at `60e21ea8`). Nested copies stay. Do not add `foundry/pnpm-workspace.yaml` or `relay/pnpm-workspace.yaml` inside Realm.
4. **Remove nested copies** — only after every `@foundry/*` and `@relay/*` consumer uses the remotes and CI is green.

## Promote remotes (needs write on foundry/relay)

`cursor[bot]` can push Realm, including `foundry-export` and `relay-export`. It cannot push `a6n-ai/foundry` or `a6n-ai/relay`. From a login that can (laptop `gh` as the Foundry owner):

```bash
cd ~/a6n-ai/foundry
git fetch https://github.com/a6n-ai/realm.git foundry-export
git merge --ff-only FETCH_HEAD
git push origin main

cd ~/a6n-ai/relay
git fetch https://github.com/a6n-ai/realm.git relay-export
git merge --ff-only FETCH_HEAD
git push origin main
```

After Foundry `main` includes that merge, bump Realm’s `@foundry/ai` lockfile pin, then exclude the next **leaf** packages from the workspace (consumed by apps/Relay app only, not by remaining `@foundry/*` workspace packages): `auth`, `auth-ui`, `clover`, `coupons`, `google-reviews`, `order-tracking`, `payments`, `places`, `routes`, `storage`, `wallet`. Keep `commons`, `themes`, `ui`, `design-system`, `crm`, `database`, `realtime`, `email`, and `eslint-config` on `workspace:*` until those consumers are converted.

## Local folder layout

Keep the three GitHub remotes as **siblings**, not nested inside each other.

```
~/a6n-ai/
  realm
  foundry
  relay
```

```bash
mkdir -p ~/a6n-ai
cd ~/a6n-ai
git clone https://github.com/a6n-ai/realm.git
git clone https://github.com/a6n-ai/foundry.git
git clone https://github.com/a6n-ai/relay.git
```

## Local gate (same as CI)

```bash
pnpm turbo typecheck --filter="@foundry/*" && pnpm turbo test --filter="@foundry/*"
pnpm turbo typecheck --filter="@relay/*" --filter=relay && pnpm turbo test --filter="@relay/*" --filter=relay
pnpm turbo typecheck --filter=tiffin-grab --filter=puchkaman
node scripts/assert-foundry-ai-from-git.mjs
```
