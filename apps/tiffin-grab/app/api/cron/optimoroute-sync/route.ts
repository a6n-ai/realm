import { cronJobRoute } from "@/lib/cron/route";
import { clampDays, parseMode } from "@/lib/optimoroute/sync";

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
// Recorded in cron_runs via runCronJob; a missing OPTIMOROUTE_API_KEY is a failed run (500).
export const dynamic = "force-dynamic";

export const { GET, POST } = cronJobRoute("optimoroute-sync", {
  input: (request) => {
    const params = new URL(request.url).searchParams;
    return { mode: parseMode(params.get("mode")), days: clampDays(params.get("days")) };
  },
});
