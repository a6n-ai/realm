import { runCronJob } from "./run";

/** mode=tick is the Queue consumer (every transactional email) and, with wake=1, the CampaignWake Workflow; otherwise the manual backstop. */
export async function runNotificationsCron(request: Request): Promise<Response> {
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
