import { withCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/run";

// Daily morning: emails customers whose plan's last tiffin is 5 days or 1 day away (lib/notifications/renewal-reminder).
// Same fail-closed bearer contract as the other cron routes. Idempotent: the outbox dedupe key drops a repeat.
// Recorded in cron_runs (Settings → Scheduled jobs) via runCronJob.
export const dynamic = "force-dynamic";

const handle = withCronAuth(async () => {
  const result = await runCronJob("renewal-reminders", "schedule");
  return Response.json(result, { status: result.ok ? 200 : 500 });
});

export const GET = handle;
export const POST = handle;
