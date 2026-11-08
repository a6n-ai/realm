import { withCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/run";

// ISR is stale-while-revalidate: a quiet page would serve yesterday's menu or an ended promo to the
// first visitor of the day. A SiteRefreshWake Workflow calls this at each local midnight / promo edge /
// owed follow-up; the run schedules the next one. Recorded in cron_runs. Fail-closed CRON_SECRET.
export const dynamic = "force-dynamic";

const handle = withCronAuth(async () => {
  const result = await runCronJob("site-refresh", "schedule");
  return Response.json(result.ok ? { ok: true, ...result.summary } : result, { status: result.ok ? 200 : 500 });
});

export const GET = handle;
export const POST = handle;
