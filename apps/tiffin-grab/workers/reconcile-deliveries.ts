import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createLogger } from "@realm/commons/logger";
import { db } from "@/db/client";
import { deliveries } from "@/db/schema";
import { reconcileMakeups } from "@/lib/services/deliveries.service";

const log = createLogger("reconcile-deliveries");

// Same self-join alias trick as reconcileMakeups (deliveries.service.ts): a correlated NOT
// EXISTS via a bare `${deliveries}` interpolation is not guaranteed to alias correctly in
// Drizzle's raw sql tag, so this uses a real join alias instead.
const existingMakeup = alias(deliveries, "existing_makeup");

/**
 * Every order owning a missed original (paused|skipped, cutoff passed) with no make-up yet.
 * Correctness does not depend on cadence — the write paths (skip/unskip/pause/resume) already
 * call reconcileMakeups themselves. This just sweeps up anything that missed cutoff without a
 * write happening on it (the common case: nobody touches the row, it just goes stale).
 */
export async function reconcileAllDeliveries(): Promise<number> {
  const rows = await db.selectDistinct({ orderId: deliveries.orderId })
    .from(deliveries)
    .leftJoin(existingMakeup, eq(existingMakeup.makeupForDeliveryId, deliveries.id))
    .where(and(
      isNull(deliveries.makeupForDeliveryId), // make-ups are terminal
      inArray(deliveries.status, ["paused", "skipped"]),
      lte(deliveries.cutoffAt, Date.now()),
      isNull(existingMakeup.id), // no make-up exists yet for this row
    ));

  let created = 0;
  for (const { orderId } of rows) {
    created += await reconcileMakeups(orderId);
  }
  log.info({ orders: rows.length, created }, "reconciled");
  return created;
}

// Entry point when run directly (tsx workers/reconcile-deliveries.ts). Scheduled daily, shortly
// after the latest cutoffHour any zone could plausibly use, by the host's own scheduler (system
// crontab / Vercel Cron — not wired here, same "the route/script is the contract" stance as
// app/api/cron/mint-rep-coupons). Cadence is a convenience only: every write path (skip/unskip/
// pause/resume) already calls reconcileMakeups itself, so a missed or delayed run just means the
// sweep-up of untouched rows happens on the next run instead.
if (process.argv[1]?.endsWith("reconcile-deliveries.ts")) {
  reconcileAllDeliveries()
    .then((n) => {
      log.info({ created: n }, "done");
      process.exit(0);
    })
    .catch((err) => {
      log.error({ err }, "fatal");
      process.exit(1);
    });
}
