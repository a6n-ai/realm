# a6n-crm

Inquiry CRM for a6n's sales team. TanStack Start on one Cloudflare Worker with D1, built like `relay/apps/relay-v2`.

## Local setup

```
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev        # http://localhost:3003
```

`pnpm deploy` is a dry run; `pnpm deploy:apply` ships. One database (D1) with migrations in `drizzle/`.
Create the D1 database only with owner approval, then set `database_id` in `wrangler.jsonc`.
