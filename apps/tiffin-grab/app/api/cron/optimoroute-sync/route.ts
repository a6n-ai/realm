import { withCronAuth } from "@/lib/cron/auth";
import { clampDays, parseMode, runScheduledSync } from "@/lib/optimoroute/sync";

// Scheduler-agnostic protected route (withCronAuth), request-time only.
//
//   # 17:00 IST — push tomorrow's stops so the dispatcher opens a full board
//   30 11 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//     "https://…/api/cron/optimoroute-sync?mode=push&days=1"
//
//   # 21:00 IST — pull back whatever was planned, so labels print in van order
//   30 15 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//     "https://…/api/cron/optimoroute-sync?mode=pull&days=1"
//
// Two lines rather than mode=both: routes are planned by a human in OptimoRoute between
// the two, so pulling immediately after a push would read an empty plan.
export const dynamic = "force-dynamic";

const handle = withCronAuth(async (request) => {
  const params = new URL(request.url).searchParams;
  const summary = await runScheduledSync({
    mode: parseMode(params.get("mode")),
    daysAhead: clampDays(params.get("days")),
  });

  // A run that reached no dates because the plugin is off is fine; one that could not run
  // because the key is missing is a misconfiguration worth alerting on.
  const status = summary.skipped === "OPTIMOROUTE_API_KEY not set" ? 503 : 200;
  return Response.json(summary, { status });
});

export const GET = handle;
export const POST = handle;
