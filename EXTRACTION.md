# Foundry / Relay extraction

Complete. Realm is apps-only. `@foundry/*` installs from [a6n-ai/foundry](https://github.com/a6n-ai/foundry). `@relay/*` installs from [a6n-ai/relay](https://github.com/a6n-ai/relay). The Relay operator app lives in the Relay repo. CSS `@source` scans `node_modules/@foundry/*/src`.

Do not add nested `foundry/` or `relay/` trees, and do not add `foundry/pnpm-workspace.yaml` or `relay/pnpm-workspace.yaml` inside Realm.

## Phases

1. Nested workspace — done.
2. Git deps, still nested (`@foundry/ai`) — done.
3. Git `@foundry/*` — done.
4. Git `@relay/*` — done.
5. CSS `@source` → `node_modules` — done.
6. Remove nested copies — done.

## Local folder layout

Keep the three GitHub remotes as **siblings**, not nested inside each other.

```
~/a6n-ai/
  realm
  foundry
  relay
```

On a machine that still has an old nested Realm clone (or a fresh laptop):

```bash
# from this repo, or after cloning realm
./scripts/setup-local-siblings.sh --install
```

That clones or fast-forwards `~/a6n-ai/{realm,foundry,relay}` (`A6N_ROOT` to override), deletes leftover nested `realm/foundry` and `realm/relay` trees, writes `~/a6n-ai/a6n-ai.code-workspace`, and (with `--install`) runs `pnpm install` in all three. Open the workspace file in Cursor. Do not clone Foundry or Relay *inside* Realm.

## Local gate (same as CI)

```bash
node scripts/assert-foundry-from-git.mjs
node scripts/assert-relay-from-git.mjs
pnpm turbo typecheck --filter=tiffin-grab --filter=puchkaman
```
