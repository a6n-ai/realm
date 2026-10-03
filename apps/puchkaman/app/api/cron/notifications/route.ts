import { createLogger } from "@foundry/commons/logger";
import { drainPending, materializeDue } from "@/lib/notifications/drain";

// Manual backstop for the Redis-signalled outbox listener (no longer scheduled): expands
// any due campaign and sends anything a lost signal left pending. Scheduled campaigns now
// start from the listener (lib/notifications/campaign-schedule.ts). Fail-closed CRON_SECRET.
export const dynamic = "force-dynamic";

const log = createLogger("cron-notifications");

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const materialized = await materializeDue();
    const processed = await drainPending();
    log.info({ materialized, processed }, "notifications pass complete");
    return Response.json({ materialized, processed });
  } catch (err) {
    log.error({ err }, "notifications pass failed");
    return Response.json({ error: "pass failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
