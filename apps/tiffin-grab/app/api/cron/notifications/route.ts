import { runCronJob } from "@/lib/cron/run";

// Manual backstop for the Redis-signalled outbox listener (no longer scheduled): expands
// any due campaign and sends anything a lost signal left pending. Scheduled campaigns now
// start from the listener (lib/notifications/campaign-schedule.ts). Fail-closed CRON_SECRET.
// Recorded in cron_runs (Settings → Scheduled jobs) via runCronJob.
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runCronJob("notifications", "schedule");
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
