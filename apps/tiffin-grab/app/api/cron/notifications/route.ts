import { createLogger } from "@foundry/commons/logger";
import { drainPending, materializeDue } from "@/lib/notifications/drain";

// Hourly backstop for the Redis-signalled outbox listener: expands scheduled
// campaigns whose time has come and sends anything a lost signal or a restart
// left pending. Fail-closed CRON_SECRET contract.
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
