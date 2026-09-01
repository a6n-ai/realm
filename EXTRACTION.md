# Foundry / Relay extraction

Realm **keeps** nested `foundry/` and `relay/` on disk. Do not delete those trees. Do not switch remaining packages to `git:` remotes until this phase’s CI is green.

Canonical remotes (`a6n-ai/foundry`, `a6n-ai/relay`) are mirrors. Most packages still install via `workspace:*`.

## Phases

1. **Nested workspace** — done. `ci` runs Foundry → Relay → apps typecheck.
2. **Git deps, still nested (now)** — `@foundry/ai` is excluded from the pnpm workspace and installed from `github:a6n-ai/foundry#path:packages/ai`. The nested `foundry/packages/ai` tree stays as a mirror only. Gate: `foundry-ai-git` plus existing jobs.
3. **Remove nested copies** — only after every `@foundry/*` and `@relay/*` consumer uses the remotes and CI is green.

## Local folder layout

Keep the three GitHub remotes as **siblings**, not nested inside each other. On this VM:

```
/home/ubuntu/a6n-ai/
  realm          → /workspace (PR branch)
  foundry        clone of a6n-ai/foundry
  relay          clone of a6n-ai/relay
  worktrees/
    realm-main
    foundry-export
    relay-export
```

On your laptop:

```bash
mkdir -p ~/a6n-ai/worktrees
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
