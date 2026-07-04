<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Realm — agent guide

Realm is a **multi-client Turborepo**: one platform, many Next.js client apps
sharing `@realm/*` packages. `apps/tiffin-grab` is the first client. Orientation:
[`PROJECT.md`](PROJECT.md) (product + roles + roadmap) and
[`docs/realm/`](docs/realm/) (structure, add-a-client, add-a-package, dev/build).

## Before you edit

- **New to a package?** Read `docs/realm/repo-structure.md` — the taxonomy and the
  acyclic dependency layering. Do not create import cycles.
- **Fixing a bug?** Fix it at the shared root, not per-caller. Most shared logic
  lives in a `@realm/*` package that many callers route through.
- **Product/client-specific code** stays in `apps/<client>` until a *second* client
  proves it is genuinely shared — only then does it graduate to a package.

## Package rules (keep the graph acyclic)

- `commons`/`themes` are the floor. `ui` imports `themes`; `design-system` composes
  `ui`; `crm-core` composes `ui` + `design-system`. Lower layers never import up.
- **`crm-core` never imports an app.** `<CrmShell>` is slot-based — nav, breadcrumbs,
  actions, footer, `getSession`, role groupings are injected as props, never baked in.
- Packages ship **raw `.ts`/`.tsx`** (no build step). Client-consumed packages must be
  in `apps/<client>/next.config.ts` `transpilePackages`. Server-only packages
  (`commons-files`, `commons-notify`, `auth`) are NOT transpiled.

## Verify contract

Packages ship source, so `tsc` is the fast gate — it resolves every workspace import.
After a non-trivial change:

```bash
pnpm turbo typecheck && pnpm turbo test
```

Two things `tsc` cannot catch — verify by eye when touching client components:
1. A stripped/missing `"use client"` directive.
2. A client symbol demoted from a named export (the `Component.Skeleton` trap).

## Conventions

- TypeScript everywhere; comment the non-obvious *why* only.
- `rg`/`fd` over `grep`/`find`.
- Pricing/totals computed **server-side only** — never trust client-submitted amounts.
- Audit fields (`created_by`/`updated_by`) stamped from the session, never from input.
- **Next.js 16:** route protection lives in `proxy.ts` (renamed `middleware.ts`).
  Read `node_modules/next/dist/docs/` before writing framework code.
