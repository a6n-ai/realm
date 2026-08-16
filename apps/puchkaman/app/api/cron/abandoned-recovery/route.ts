import {
  purgeCarts,
  remindAbandonedCarts,
  remindAbandonedOrders,
  terminalizeAbandonedOrders,
} from "@/lib/recovery/passes";

// Scheduler-agnostic protected route, same fail-closed contract as the
// review-nudge cron.
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Remind before terminalizing: the reminder window (1h) sits well inside the
  // terminal window (24h), and a link minted here expires exactly when the
  // order dies.
  const remindedOrders = await remindAbandonedOrders();
  const remindedCarts = await remindAbandonedCarts();
  const terminalized = await terminalizeAbandonedOrders();
  const purged = await purgeCarts();

  return Response.json({ remindedOrders, remindedCarts, terminalized, purged });
}

export const GET = handle;
export const POST = handle;
