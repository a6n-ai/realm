import { zonedDateIso } from "@realm/commons";
import { pullCompletions } from "@/lib/services/optimoroute/completions";
import { getAppSettings } from "@/lib/services/app-settings.service";

// Scheduler-agnostic protected route, same fail-closed bearer contract as
// optimoroute-sync/mint-rep-coupons/review-nudge. Deliberately PULL-ONLY: this
// reads OptimoRoute completion status and reduces a customer's tiffin count
// when a delivery is confirmed done (or the cutoff has passed with no
// confirmation) — it never pushes anything to OptimoRoute. Pushing stays a
// manual, staff-triggered action (Routes page "Send stops" button) until a
// sandbox account exists to build and test that automation safely.
//
//   # 22:00 IST — after drivers finish today's run, reconcile tiffin counts
//   30 16 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//     "https://…/api/cron/pull-completions"
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  // Fail closed: no configured secret, or a mismatched bearer → 401.
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { timezone } = await getAppSettings();
  const date = zonedDateIso(Date.now(), timezone);
  const result = await pullCompletions(date, null);
  return Response.json(result);
}

// Vercel Cron issues GET; system crontab can curl either verb with the bearer.
export const GET = handle;
export const POST = handle;
