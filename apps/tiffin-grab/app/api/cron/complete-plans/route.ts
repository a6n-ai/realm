import { runCronJob } from "@/lib/cron/run";

// Nightly, right after pull-completions: closes every active plan that is over (no delivery
// left from today on, no missed day still waiting for a make-up). Same fail-closed bearer
// contract as the other cron routes. Idempotent: an order already closed is never touched.
// Recorded in cron_runs (Settings → Scheduled jobs) via runCronJob.
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runCronJob("complete-plans", "schedule");
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
