import { zonedDateIso } from "@foundry/commons";
import { pullCompletions } from "@/lib/services/optimoroute/completions";
import { getAppSettings } from "@/lib/services/app-settings.service";

// Nightly reconcile with OptimoRoute, same fail-closed bearer contract as the other cron
// routes. PULL-ONLY: it records what OptimoRoute says for today's stops and never pushes.
// Safe to run unattended because pullCompletions only acts on OptimoRoute's own answer:
// "success" marks the day delivered (the only automatic way tiffins left goes down),
// "failed" marks it not delivered, and an open or unmatched stop is left awaiting
// confirmation for staff. Staff can still pull any date from Dispatch → Completions.
//
//   # 22:00 IST — after drivers finish the run
//   30 16 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://…/api/cron/pull-completions"
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { timezone } = await getAppSettings();
  const result = await pullCompletions(zonedDateIso(Date.now(), timezone), null);
  return Response.json(result);
}

export const GET = handle;
export const POST = handle;
