import { clampDays, parseMode, runScheduledSync } from "@/lib/services/optimoroute/sync";

// Scheduler-agnostic protected route, same contract as the mint-rep-coupons job: a bearer
// secret, fail-closed, request-time only.
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

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  // Fail closed: no configured secret, or a mismatched bearer → 401.
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const summary = await runScheduledSync({
    mode: parseMode(params.get("mode")),
    daysAhead: clampDays(params.get("days")),
  });

  // A run that reached no dates because the plugin is off is fine; one that could not run
  // because the key is missing is a misconfiguration worth alerting on.
  const status = summary.skipped === "OPTIMOROUTE_API_KEY not set" ? 503 : 200;
  return Response.json(summary, { status });
}

export const GET = handle;
export const POST = handle;
