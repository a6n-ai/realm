import { cronJobRoute } from "@/lib/cron/route";

// ISR is stale-while-revalidate: a quiet page would serve yesterday's menu or an ended promo to the
// first visitor of the day. A SiteRefreshWake Workflow calls this at each local midnight / promo edge /
// owed follow-up; the run schedules the next one. Recorded in cron_runs. Fail-closed CRON_SECRET.
export const dynamic = "force-dynamic";

export const { GET, POST } = cronJobRoute("site-refresh", {
  shape: (result) => (result.ok ? { ok: true, ...result.summary } : result),
});
