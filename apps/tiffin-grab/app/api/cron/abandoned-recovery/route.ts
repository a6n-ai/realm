import { createLogger } from "@realm/commons/logger";
import { terminalizeAbandonedOrders } from "@/lib/recovery/passes";

// Scheduler-agnostic protected route, same fail-closed contract as optimoroute-sync
// and review-nudge. Only the abandoned-order sweep runs here — tiffin-grab has no
// cart entity, so puchkaman's remind/purge-cart passes have nothing to port to.
export const dynamic = "force-dynamic";

const log = createLogger("cron-abandoned-recovery");

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const terminalized = await terminalizeAbandonedOrders();
    return Response.json({ terminalized });
  } catch (err) {
    log.error({ err }, "abandoned-recovery pass failed");
    return Response.json({ terminalized: null, error: "pass failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
