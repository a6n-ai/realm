# Adding a New Client App

Each client (Gym, Dentist, Realtor, …) is its own Next.js app under `apps/`,
reusing the shared `@realm/*` packages. Nothing in `packages/` needs to change
to add a client — that's the whole point.

## 1. Scaffold the app

```bash
mkdir -p apps/<client>
```

Copy `apps/tiffin-grab` as the template, or start minimal. The app's
`package.json`:

```jsonc
{
  "name": "<client>",              // unscoped, the client name (hyphen-case)
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@realm/commons": "workspace:*",
    "@realm/commons-drizzle": "workspace:*",
    "@realm/commons-next": "workspace:*",
    "@realm/ui": "workspace:*",
    "@realm/design-system": "workspace:*",
    "@realm/crm-core": "workspace:*",
    "@realm/themes": "workspace:*",
    "@realm/auth": "workspace:*"
    // add commons-files / commons-notify only if the client uploads files / sends email
  }
}
```

Pick only the packages the client actually uses. `apps/*` is already a
`pnpm-workspace.yaml` glob, so `pnpm install` picks the app up automatically —
no registration needed.

## 2. Set transpilePackages

In `apps/<client>/next.config.ts`, list every **client-consumed** `@realm/*`
package (they ship raw source):

```ts
transpilePackages: [
  "@realm/commons", "@realm/commons-drizzle", "@realm/commons-next",
  "@realm/themes", "@realm/ui", "@realm/design-system", "@realm/crm-core",
],
// server-only (commons-files, commons-notify, auth) are NOT listed
```

Also set `output: "standalone"` and `outputFileTracingRoot` to the monorepo
root (copy `apps/tiffin-grab/next.config.ts`).

## 3. Author the client config (the injection seam)

The shared shell packages are client-agnostic — the client supplies its own
vocabulary. Provide, from the app:

- **Nav** — `SECTIONS` for the sidebar and global search.
- **Route labels** — a `labelForSegment(segment)` for `<Breadcrumbs resolveLabel={…}>`.
- **Role model** — compose `createRoleGuards(getSession)` into the client's own
  `requireAdmin`/`requireStaff` (its role groupings).
- **Session** — the client's `getSession` (its own auth wiring).
- **Theme tokens** — the palette in the app's `globals.css`.
- **Metadata** — app title/description in the root layout.

## 4. Wire the dashboard shell

Compose the app's pieces into `<CrmShell>` slots (see
`apps/tiffin-grab/app/(dashboard)/dashboard/layout.tsx`). All data-wiring
(session, services) stays in the app layout:

```tsx
import { CrmShell } from "@realm/crm-core";

<CrmShell
  sidebar={<AppSidebar … />}
  breadcrumbs={<Breadcrumbs resolveLabel={labelForSegment} />}
  actions={<>…</>}
  footer={hasPin ? <IdleLock /> : null}
>
  {children}
</CrmShell>
```

## 5. Auth guards

```ts
// apps/<client>/lib/auth/guards.ts
import { Role } from "@realm/commons";
import { createRoleGuards } from "@realm/auth";
import { getSession } from "./session";      // the client's own session source

const { requireRole } = createRoleGuards(getSession);
export { requireRole };
export const requireAdmin = () => requireRole(Role.ADMIN);
export const requireStaff = () => requireRole(Role.ADMIN, Role.MEMBER);
```

## 6. Deploy

Each client owns its own image pair and build target:

- GHCR images `ghcr.io/a6n-ai/<client>-web` + `<client>-tools`.
- Add `Build + push` steps for the client to `.github/workflows/deploy.yml`.
- Give it `WEB_IMAGE`/`TOOLS_IMAGE` defaults in a per-client prod compose file
  (or parameterize the existing one). **The push tags in `deploy.yml` and the
  compose image defaults must match**, or the box pulls an image CI never built.
- After the first push, flip the new GHCR packages PUBLIC (or keep box creds).

## 7. Verify

```bash
pnpm install
pnpm turbo typecheck --filter=<client>...
pnpm --filter <client> build      # produces .next/standalone
```

Green typecheck + a standalone build = the client is wired correctly.
