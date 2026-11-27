# a6n

Inquiry CRM for a6n's sales team. TanStack Start on one Cloudflare Worker with D1, built like `relay/apps/relay-v2`.

## Local setup

```
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev        # http://localhost:3003
```

`pnpm run deploy` is a dry run (plain `pnpm deploy` is a pnpm builtin); `pnpm run deploy:apply` ships. Seed: `node scripts/seed.ts --admin <email>:<name> ...` then `pnpm db:seed:remote`. Promote: `node scripts/seed.ts --promote <email> --by <email>` then `wrangler d1 execute a6n --remote --file scripts/.promote.sql`. One database (D1) with migrations in `drizzle/`.
Create the D1 database only with owner approval, then set `database_id` in `wrangler.jsonc`.
