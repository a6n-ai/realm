import { cronJobRoute } from "@/lib/cron/route";

// Not deployed yet: a real scheduler runs it just after 00:00 in the app-settings timezone
// (America/Toronto: `5 4 * * *` UTC in EDT, `5 5 * * *` in EST) when a host is chosen.
// Recorded in cron_runs via runCronJob.
export const dynamic = "force-dynamic";

export const { GET, POST } = cronJobRoute("mint-rep-coupons");
