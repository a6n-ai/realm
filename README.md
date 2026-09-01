# Realm

A multi-client CRM + subscription **platform**. Realm holds **apps** (TiffinGrab, Puchkaman). Shared packages are `@foundry/*` under `foundry/` (Monarch AI packages go there too). The notification product is `relay/`. Nested `foundry/` and `relay/` stay in this repo until tests pass — see [EXTRACTION.md](EXTRACTION.md). Do not delete those trees or switch to git remotes yet.

## Quick start

```bash
pnpm install          # link workspace packages (pnpm@10.34.4, pinned)
pnpm dev              # turbo run dev — starts the app(s)
pnpm dev:fresh        # kill :3000, clear .next, then dev
```

Open [http://localhost:3000](http://localhost:3000).

Verify after a change:

```bash
pnpm turbo typecheck && pnpm turbo test
```

Scope to one app/package with a filter, e.g. `pnpm turbo typecheck --filter=tiffin-grab...`.

## Docs

- **[PROJECT.md](PROJECT.md)** — product vision, roles, subsystem roadmap, tech stack.
- **[docs/realm/](docs/realm/)** — repo structure, package taxonomy, add-a-client /
  add-a-package guides, and the dev/build workflow.
- **[AGENTS.md](AGENTS.md)** — this is not the Next.js you know; read the in-repo Next
  docs (`node_modules/next/dist/docs/`) before writing framework code.

## Stack

Turborepo + pnpm · Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 +
shadcn/ui · better-auth · PostgreSQL + Drizzle ORM · Vitest.
