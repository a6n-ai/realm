# Foundry / Relay extraction

Realm **keeps** nested `foundry/` and `relay/` on disk. Do not delete those trees.

Canonical remotes ([a6n-ai/foundry](https://github.com/a6n-ai/foundry), [a6n-ai/relay](https://github.com/a6n-ai/relay)) are mirrors. Floor `@foundry/*` packages still install via `workspace:*`.

## Phases

1. **Nested workspace** — done. `ci` runs Foundry → Relay → apps typecheck.
2. **Git deps, still nested (`@foundry/ai`)** — done. Gate: `foundry-git` (was `foundry-ai-git`).
3. **Promote remotes + leaf git deps (now)** — `a6n-ai/foundry` `main` includes CodeQL-safe sources and package CI. Realm installs these from git (nested trees stay as mirrors): `ai`, `auth`, `auth-ui`, `clover`, `coupons`, `google-reviews`, `order-tracking`, `payments`, `places`, `routes`, `storage`, `wallet`. Still `workspace:*`: `commons`, `themes`, `ui`, `design-system`, `crm`, `database`, `realtime`, `email`, `eslint-config`. Do not add `foundry/pnpm-workspace.yaml` or `relay/pnpm-workspace.yaml` inside Realm.
4. **Remove nested copies** — only after every `@foundry/*` and `@relay/*` consumer uses the remotes and CI is green.

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
node scripts/assert-foundry-from-git.mjs
```
