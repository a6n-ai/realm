# Foundry / Relay extraction freeze

Realm **keeps** nested `foundry/` and `relay/` until tests pass on CI. Do not delete those trees. Do not switch apps to `git:` / GitHub remotes yet.

Canonical remotes already exist (`a6n-ai/foundry`, `a6n-ai/relay`) as **mirrors**. Realm still installs `workspace:*` from the nested copies so TiffinGrab and Puchkaman keep a single lockfile.

## Phases

1. **Nested workspace (now)** — `pnpm-workspace.yaml` includes `foundry/packages/*`, `foundry/tooling/*`, `relay/apps/*`, `relay/packages/*`. Gate: GitHub Actions `ci` (Foundry → Relay → apps).
2. **Git deps, still nested** — only after phase 1 is green. Dual-path: keep trees, point a *single* non-app package at the remote and re-run CI.
3. **Remove nested copies** — only after phase 2 is green for every `@foundry/*` and `@relay/*` consumer in this repo.

## Local gate (same as CI)

```bash
pnpm turbo typecheck --filter="@foundry/*" && pnpm turbo test --filter="@foundry/*"
pnpm turbo typecheck --filter="@relay/*" --filter=relay && pnpm turbo test --filter="@relay/*" --filter=relay
pnpm turbo typecheck --filter=tiffin-grab --filter=puchkaman && pnpm turbo test --filter=tiffin-grab --filter=puchkaman
```
