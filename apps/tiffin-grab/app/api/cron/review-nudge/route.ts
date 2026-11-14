import { cronJobRoute } from "@/lib/cron/route";

// Recorded in cron_runs (Settings → Scheduled jobs) via runCronJob.
export const dynamic = "force-dynamic";

export const { GET, POST } = cronJobRoute("review-nudge");
