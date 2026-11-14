import { cronJobRoute } from "@/lib/cron/route";

// Daily morning: emails customers whose plan's last tiffin is 5 days or 1 day away (lib/notifications/renewal-reminder).
// Same fail-closed bearer contract as the other cron routes. Idempotent: the outbox dedupe key drops a repeat.
// Recorded in cron_runs (Settings → Scheduled jobs) via runCronJob.
export const dynamic = "force-dynamic";

export const { GET, POST } = cronJobRoute("renewal-reminders");
