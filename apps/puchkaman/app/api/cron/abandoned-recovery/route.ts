import { createLogger } from "@foundry/commons/logger";
import {
  purgeCarts,
  remindAbandonedCarts,
  remindAbandonedOrders,
  syncPendingPaymentStatuses,
  terminalizeAbandonedOrders,
} from "@/lib/recovery/passes";

// Scheduler-agnostic protected route, same fail-closed contract as the
// review-nudge cron.
export const dynamic = "force-dynamic";

const log = createLogger("cron-abandoned-recovery");

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Remind before terminalizing: the reminder window (1h) sits well inside the
  // terminal window (24h), and a link minted here expires exactly when the
  // order dies. Each pass is isolated — one throwing (e.g. RECOVERY_LINK_SECRET
  // unset) must not stop the rest from running, or coins stay stranded and
  // carts never purge just because reminders can't mint a link.
  const passes: Array<
    ["remindedOrders" | "remindedCarts" | "paymentsSynced" | "terminalized" | "purged", () => Promise<number>]
  > = [
    ["remindedOrders", remindAbandonedOrders],
    ["remindedCarts", remindAbandonedCarts],
    // Before terminalize: a payment that landed but never webhooked in should
    // get one last chance to settle before the sweep kills its order.
    ["paymentsSynced", syncPendingPaymentStatuses],
    ["terminalized", terminalizeAbandonedOrders],
    ["purged", purgeCarts],
  ];

  const counts: Record<string, number | null> = {};
  const failures: string[] = [];
  for (const [key, run] of passes) {
    try {
      counts[key] = await run();
    } catch (err) {
      log.error({ err, pass: key }, "abandoned-recovery pass failed");
      counts[key] = null;
      failures.push(key);
    }
  }

  return Response.json({ ...counts, failures });
}

export const GET = handle;
export const POST = handle;
