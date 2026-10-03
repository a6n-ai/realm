import { runCronJob } from "@/lib/cron/run";

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

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runCronJob("pull-completions", "schedule");
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
