# Local docker stack

Local rehearsal of the prod stack (`../`). Proxy is **Caddy** (HTTP-only here),
same as prod. DB is **RDS** — no local Postgres container.

## Two ways to run

### Redis only (cache dev; app on host)

Run the cache in a container, the app on the host with `pnpm dev`:

```sh
docker compose -f deployment/local/redis/docker-compose.yml up
# apps/web/.env.local:  REDIS_URL=redis://127.0.0.1:6379
pnpm --filter web dev
```

### Full stack (caddy + web + redis)

```sh
cd deployment/local
cp .env.local.example .env.local   # fill in RDS DATABASE_URL + secrets
docker compose up --build
# open http://localhost
```

`redis/` and `caddy/` are pulled in via compose `include:` — the standalone redis
file above is the same definition the full stack uses.

## Notes

- **DB is RDS** — your `.env.local` `DATABASE_URL` points at it. The security group
  must allow your IP on :5432.
- **No TLS** — Caddy runs plain HTTP on `:80`; `BETTER_AUTH_URL=http://localhost`.
  Prod adds auto-TLS via the same Caddyfile shape.
- **Files** default to on-disk `LocalStorageProvider` inside the container
  (ephemeral). Set `FILES_S3_*` to test S3.
- **worker** (PG LISTEN notification consumer) isn't built yet — same as prod;
  add it here when `apps/worker` lands.
