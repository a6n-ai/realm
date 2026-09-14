# Xplorers

Realm client for [xplorers.life](https://xplorers.life/) — Science Explorers Club.

Same login as TiffinGrab / Puchkaman (`user`, `admin`, `member`) on Better Auth.

## Local

```bash
createdb xplorers   # once
cp apps/xplorers/.env.example apps/xplorers/.env.local
# set BETTER_AUTH_SECRET (openssl rand -base64 32)

pnpm install
pnpm --filter xplorers db:migrate
SEED_ADMIN_PASSWORD='...' pnpm --filter xplorers exec tsx db/seed-admin.ts
pnpm --filter xplorers exec tsx db/seed-brand-org.ts
pnpm --filter xplorers dev   # http://localhost:3002
```

Without SES configured, OTP codes print in the server log (development).

| Role | Home |
|------|------|
| `admin` / `member` | `/dashboard` (password; invited members set one on first login) |
| `user` | `/me` (password or emailed code; `/signup` creates the account) |
