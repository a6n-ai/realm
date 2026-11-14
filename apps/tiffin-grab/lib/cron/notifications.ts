import { runCronJob } from "./run";

/** mode=tick is the Queue consumer (every transactional email) and, with wake=1, the CampaignWake Workflow; otherwise the manual backstop. */
export async function runNotificationsCron(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  if (params.get("mode") !== "tick") {
    const result = await runCronJob("notifications", "schedule");
    return Response.json(result, { status: result.ok ? 200 : 500 });
  }
  const r = await runCronJob("campaign-wake", "schedule");
  if (!r.ok || params.get("wake") === "1") return Response.json(r, { status: r.ok ? 200 : 500 });
  // The Queue consumer reads retryAfterMs at the top level.
  const { retryAfterMs, ...summary } = r.summary;
  return Response.json({ ok: true, retryAfterMs, summary });
}
