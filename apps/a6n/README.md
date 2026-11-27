# a6n

Inquiry CRM for a6n's sales team. TanStack Start on one Cloudflare Worker with D1, built like `relay/apps/relay-v2`.

## Local setup

```
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev        # http://localhost:3003
```

`pnpm run deploy` is a dry run (plain `pnpm deploy` is a pnpm builtin); `pnpm run deploy:apply` ships. There are no seed scripts: admins invite people from Team (invites are always `sales`), and an owner makes someone an admin by hand in the D1 console. One database (D1) with migrations in `drizzle/`.
Create the D1 database only with owner approval, then set `database_id` in `wrangler.jsonc`.
