# Foundry / Relay extraction

Realm **keeps** nested `foundry/` and `relay/` on disk. Do not delete those trees.

Canonical remotes ([a6n-ai/foundry](https://github.com/a6n-ai/foundry), [a6n-ai/relay](https://github.com/a6n-ai/relay)) are mirrors. `@relay/*` still installs via `workspace:*`. `@foundry/eslint-config` stays `workspace:*` under `foundry/tooling`.

## Phases

1. **Nested workspace** — done.
2. **Git deps, still nested (`@foundry/ai`)** — done.
3. **Promote remotes + git `@foundry/*` (now)** — Realm installs Foundry packages from `github:a6n-ai/foundry#path:packages/<name>` (nested trees stay as mirrors; CSS `@source` still scans nested `ui` / `design-system` / `crm` / `auth-ui`). Gate: `foundry-git` + apps typecheck. Still `workspace:*`: `@foundry/eslint-config`, all `@relay/*`. Do not add `foundry/pnpm-workspace.yaml` or `relay/pnpm-workspace.yaml` inside Realm.
4. **Remove nested copies** — only after Relay also installs from `a6n-ai/relay`, CSS `@source` points at `node_modules`, and CI is green.

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
pnpm turbo typecheck --filter="@foundry/eslint-config"
pnpm turbo typecheck --filter="@relay/*" --filter=relay && pnpm turbo test --filter="@relay/*" --filter=relay
pnpm turbo typecheck --filter=tiffin-grab --filter=puchkaman
node scripts/assert-foundry-from-git.mjs
```
