# Adding a Shared Package

Shared platform code lives under `packages/` with scope `@realm/*`. Add a
package only when code is genuinely reused across clients (or clearly will be) —
not speculatively. When one client owns something, keep it in the app until a
second client proves it shared.

## Checklist

1. **Create the dir + manifest** — `packages/<name>/package.json`:

   ```jsonc
   {
     "name": "@realm/<name>",
     "version": "0.0.0",
     "private": true,
     "type": "module",
     "exports": { ".": "./src/index.ts" },   // raw source, no build step
     "types": "./src/index.ts",
     "scripts": { "typecheck": "tsc --noEmit" },
     "dependencies": { "@realm/commons": "workspace:*" },
     "peerDependencies": { "react": "^19" }   // react/next as PEER, not dep
   }
   ```

   - No build step. Packages ship raw `.ts`/`.tsx`; consumers transpile them.
   - `react`/`next` are **peerDependencies** (the app owns the single copy);
     add them to `devDependencies` too so the package typechecks standalone.
   - Real runtime libs (radix, lucide, bcryptjs, …) are `dependencies`.

2. **tsconfig** — `packages/<name>/tsconfig.json`:

   ```jsonc
   { "extends": "../../tsconfig.base.json",
     "compilerOptions": { "lib": ["ES2022", "DOM"], "jsx": "react-jsx" },
     "include": ["src"] }
   ```
   Omit `lib`/`jsx` for a pure non-React package.

3. **Exports shape** — two patterns in use:
   - **Barrel** (`"." → src/index.ts`) — for a curated public API
     (`design-system`, `crm-core`, `themes`, `auth`).
   - **Wildcard subpaths** (`"./*": "./src/*.tsx"` + `"./cn": "./src/cn.ts"`) —
     for a flat primitive set (`ui`), so consumers import
     `@realm/ui/button` 1:1 with no barrel and no import-merging churn.

4. **Consume it** — in the app: add `"@realm/<name>": "workspace:*"` to
   `dependencies`, then `pnpm install`.

5. **transpilePackages** — if the package is **client-consumed** (imported by
   any client component / rendered in the browser), add it to the app's
   `next.config.ts` `transpilePackages`. Server-only packages are NOT listed
   (see `commons-files`, `commons-notify`, `auth`).

6. **RSC rules** (tsc will NOT catch violations — verify by eye):
   - `"use client"` goes at the **top** of the file (before imports). It
     survives only because packages ship raw source; a future bundler/build
     step could silently strip it.
   - Every client symbol is a **named** export. `Component.Skeleton` static
     properties do **not** survive the client-reference boundary — export
     skeleton twins as top-level named exports.
   - Props crossing a Server→Client boundary must be React-serializable — pass
     rendered slots, not callbacks (see `<CrmShell>`).

## Anti-duplication

Before creating `@realm/<name>`, check it doesn't already exist under a
different name:
- HTTP route factories / service base → **already** `@realm/commons-next` +
  `@realm/commons-drizzle`. Don't make `packages/api`.
- Generic utils / shared types → **already** `@realm/commons`. Don't make
  `packages/utils` or `packages/types`.
- Currency, dates, pagination, errors, enums → **already** in `@realm/commons`.

## Layering

Respect the acyclic layering in `repo-structure.md`. A new package may depend
on packages **below** it; nothing may depend on the app. If a package needs
something app-specific, **inject it** (function/prop/slot) rather than importing
the app.
