import { runCronJob } from "@/lib/cron/run";

// Two callers. mode=tick: the Queue consumer (every transactional email) and the CampaignWake Workflow
// (`wake=1`, recorded in cron_runs as campaign-wake). Otherwise the manual backstop that expands any due
// campaign and sends anything a lost signal left pending. Fail-closed CRON_SECRET.
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  if (params.get("mode") === "tick") {
    if (params.get("wake") === "1") {
      const r = await runCronJob("campaign-wake", "schedule");
      return Response.json(r, { status: r.ok ? 200 : 500 });
    }
    try {
      const { runTick } = await import("@/lib/notifications/tick");
      const { retryAfterMs, ...summary } = await runTick();
      return Response.json({ ok: true, retryAfterMs, summary });
    } catch (err) {
      return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  const result = await runCronJob("notifications", "schedule");
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
