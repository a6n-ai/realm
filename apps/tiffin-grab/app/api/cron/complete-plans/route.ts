import { cronJobRoute } from "@/lib/cron/route";

// Nightly, right after pull-completions: closes every active plan that is over (no delivery
// left from today on, no missed day still waiting for a make-up). Same fail-closed bearer
// contract as the other cron routes. Idempotent: an order already closed is never touched.
// Recorded in cron_runs (Settings → Scheduled jobs) via runCronJob.
export const dynamic = "force-dynamic";

export const { GET, POST } = cronJobRoute("complete-plans");
