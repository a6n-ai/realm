import { cronJobRoute } from "@/lib/cron/route";

// Nightly reconcile with OptimoRoute, same fail-closed bearer contract as the other cron
// routes. PULL-ONLY: it records what OptimoRoute says for today's stops and never pushes.
// Safe to run unattended because pullCompletions only acts on OptimoRoute's own answer:
// "success" marks the day delivered (the only automatic way tiffins left goes down),
// "failed" marks it not delivered, and an open or unmatched stop is left awaiting
// confirmation for staff. Staff can still pull any date from Dispatch → Completions.
//
//   # 22:00 IST — after drivers finish the run
//   30 16 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://…/api/cron/pull-completions"
// Recorded in cron_runs (Settings → Scheduled jobs) via runCronJob.
export const dynamic = "force-dynamic";

export const { GET, POST } = cronJobRoute("pull-completions");
