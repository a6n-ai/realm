# Foundry / Relay extraction

Realm **keeps** nested `foundry/` and `relay/` on disk. Do not delete those trees
until CSS `@source` points at `node_modules` and CI is green.

Canonical remotes ([a6n-ai/foundry](https://github.com/a6n-ai/foundry), [a6n-ai/relay](https://github.com/a6n-ai/relay)) are mirrors. All `@foundry/*` install from `a6n-ai/foundry`. All `@relay/*` packages install from `a6n-ai/relay`. The nested Relay Next app (`relay/apps/relay`) stays in the Realm workspace.

## Phases

1. **Nested workspace** — done.
2. **Git deps, still nested (`@foundry/ai`)** — done.
3. **Promote remotes + git `@foundry/*`** — done.
4. **Git `@relay/*` (now)** — Realm installs packages from `github:a6n-ai/relay#path:packages/<name>`. Nested trees stay as mirrors; CSS `@source` still scans nested Foundry `ui` / `design-system` / `crm` / `auth-ui`. Gate: foundry-assert + relay-assert + `turbo typecheck --filter=relay` + apps typecheck. Do not add `foundry/pnpm-workspace.yaml` or `relay/pnpm-workspace.yaml` inside Realm.
5. **Retarget CSS + remove nested copies** — point `@source` at `node_modules`, then delete nested `foundry/` and `relay/` trees. Only after CI is green.

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
