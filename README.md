# Realm

A multi-client CRM and subscription platform. Realm is a Turborepo of **apps**, one per client. Shared packages are `@foundry/*` from [a6n-ai/foundry](https://github.com/a6n-ai/foundry) (Monarch AI packages go there too). Notifications are `@relay/*` from [a6n-ai/relay](https://github.com/a6n-ai/relay). See [EXTRACTION.md](EXTRACTION.md) for how those were split out.

## Apps

| App | Folder | Dev port | Status |
|---|---|---|---|
| TiffinGrab | [`apps/tiffin-grab`](apps/tiffin-grab) | 3000 | Live at app.tiffingrab.ca: subscriptions, deliveries and OptimoRoute dispatch, payments (Stripe, e-Transfer), staff CRM and analytics |
| Xplorers | [`apps/xplorers`](apps/xplorers) | 3002 | Marketing site, auth, classes and pricing |
| Puchkaman | [`apps/puchkaman`](apps/puchkaman) | 3000 | Sunsetted: code kept, no active development |

## Quick start

On a local machine, keep Foundry and Relay as **sibling** clones (not inside Realm):

```bash
./scripts/setup-local-siblings.sh --install
# opens ~/a6n-ai/{realm,foundry,relay} and ~/a6n-ai/a6n-ai.code-workspace
```

Then in `realm`:

```bash
pnpm install          # pnpm@11.25.0 (packageManager)
pnpm dev              # turbo run dev: starts the apps
pnpm dev:fresh        # kill :3000, clear .next, then dev
```

Open [http://localhost:3000](http://localhost:3000). Run one app with a filter, for example `pnpm turbo dev --filter=tiffin-grab`.

## Verify a change

```bash
pnpm turbo typecheck && pnpm turbo test   # tsc is the fast gate: packages ship raw TS
pnpm konsistent                           # repo conventions (file and export naming)
```

Scope to one app or package with a filter, for example `pnpm turbo typecheck --filter=tiffin-grab...`.

Database tests need a test database. Never point Vitest at your dev database; in TiffinGrab run it as `env -u DATABASE_URL pnpm exec vitest run <path>`.

## Database migrations

Migrations are generated with `pnpm db:generate` (drizzle-kit) and applied with `pnpm db:migrate`, run inside the app folder; they change schema only, never data. The rules (journal ordering, no hand edits, prod checks) are in [AGENTS.md](AGENTS.md#migrations--strict-rules), and `scripts/check-migration-journal.mjs` enforces them in CI and before every deploy.

## Repo map

- **[PROJECT.md](PROJECT.md)**: product vision, roles, subsystem roadmap, tech stack.
- **[AGENTS.md](AGENTS.md)**: package layering rules, the verify contract, migration rules and ReUI design rules. Next.js 16 differs from older versions; read `node_modules/next/dist/docs/` before writing framework code.
- **`apps/<client>`**: one Next.js app per client. Client-specific code stays here until a second client needs it.
- **`deployment/`**: production, local, Cloudflare, DNS, email and CDN configuration.
- **`scripts/`**: setup and CI checks.
- **`.claude/skills/`**: committed agent skills (for example `scaffold-client`).

## Stack

Turborepo + pnpm · Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 + shadcn/ui and ReUI · better-auth · PostgreSQL + Drizzle ORM · Vitest + Playwright.

## License

GNU Affero General Public License v3.0. See [`LICENSE`](LICENSE).

Shared UI and data packages live in [a6n-ai/foundry](https://github.com/a6n-ai/foundry) under Apache 2.0. Notifications live in [a6n-ai/relay](https://github.com/a6n-ai/relay), also AGPL-3.0. Importing Foundry does not relicense Foundry; the Realm apps as shipped are AGPL.
