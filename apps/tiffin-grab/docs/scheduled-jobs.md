# Scheduled & background jobs — tiffin-grab

Reference for recurring jobs that need a scheduler. As of now there is **no
cron scheduler wired** (`vercel.json` has no `crons`, and the manual
`tsx db/*.ts` CLI triggers have been removed). Jobs are invoked only when
something calls their HTTP route. A proper scheduler is planned — this doc is
the list it should drive.

## How a job is structured here

Each job is written **once** as a service function in `lib/services/`, then
exposed through a thin, `CRON_SECRET`-protected HTTP route under
`app/api/cron/<job>/route.ts`. The scheduler's only responsibility is to hit
that route on schedule with the secret header. Do **not** re-implement job
logic in the scheduler.

```
lib/services/<job>.ts          # the logic (also unit-tested)
app/api/cron/<job>/route.ts    # protected HTTP entry: checks CRON_SECRET, awaits the service
```

There used to be standalone `db/<job>.ts` CLI wrappers that ran the same
service with no HTTP/secret (for manual or external-scheduler use). These were
removed (2026-07-05) to keep a single trigger path; when the scheduler lands it
calls the HTTP route, not a CLI.

## Jobs

| Job | Service | Route | Suggested cadence | Notes |
|-----|---------|-------|-------------------|-------|
| Rep daily-coupon mint | `lib/services/mint-rep-coupons.ts` (`mintRepCoupons`) | `POST /api/cron/mint-rep-coupons` | Daily, early AM in the shop timezone | Mints each rep's daily discount coupon. Idempotent per day — safe to re-run. Covered by `lib/services/__tests__/wf3-discounts.service.test.ts`. |

## Auth for cron routes

Routes read `process.env.CRON_SECRET` and reject calls without the matching
secret. The scheduler must send it (e.g. an `Authorization`/secret header — see
`app/api/cron/mint-rep-coupons/route.ts` for the exact check). Keep `CRON_SECRET`
set in every environment that runs the scheduler.

## When adding the scheduler

1. Pick the mechanism (Vercel Cron via `vercel.json` `crons`, an external
   scheduler hitting the routes, or a worker) — one place, all jobs.
2. For each job in the table, schedule a call to its route at the chosen cadence
   with `CRON_SECRET`.
3. Add new jobs by writing a service + a protected route, then a row here — never
   a bare CLI script.
