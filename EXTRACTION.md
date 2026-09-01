# Foundry / Relay extraction

Nested `foundry/` and `relay/` stay on disk until they are deleted in the last
step. Do not delete them until CSS `@source` is on `node_modules` and CI is green.

Canonical remotes ([a6n-ai/foundry](https://github.com/a6n-ai/foundry), [a6n-ai/relay](https://github.com/a6n-ai/relay)) are mirrors. All `@foundry/*` install from `a6n-ai/foundry`. All `@relay/*` packages install from `a6n-ai/relay`. The nested Relay Next app (`relay/apps/relay`) stays in the Realm workspace until nested trees are removed.

## Phases

1. **Nested workspace** — done.
2. **Git deps, still nested (`@foundry/ai`)** — done.
3. **Promote remotes + git `@foundry/*`** — done.
4. **Git `@relay/*`** — done (packages from `github:a6n-ai/relay#path:packages/<name>`; nested app stays).
5. **Retarget CSS `@source` (now)** — scan `node_modules/@foundry/{ui,design-system,crm,auth-ui}/src`. Nested trees stay as unused mirrors. Gate: foundry-assert + relay-assert + apps typecheck. Do not add nested `pnpm-workspace.yaml` files.
6. **Remove nested copies** — delete nested `foundry/` and `relay/` (the Relay operator app lives in a6n-ai/relay). Only after CI is green.

## Local folder layout

Keep the three GitHub remotes as **siblings**, not nested inside each other.

```
~/a6n-ai/
  realm
  foundry
  relay
```

## Local gate (same as CI)

```bash
node scripts/assert-foundry-from-git.mjs
node scripts/assert-relay-from-git.mjs
pnpm turbo typecheck --filter=relay
pnpm turbo typecheck --filter=tiffin-grab --filter=puchkaman
```
