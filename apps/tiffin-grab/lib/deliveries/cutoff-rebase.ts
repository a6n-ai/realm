import { cutoffOpenSql } from "@/lib/dates/cutoff-sql";
import { cutoffMsFor } from "@foundry/commons";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries } from "@/db/schema";

/** Re-stamps cutoffAt on still-open delivery rows after the cutoff hour or timezone changes. */
export async function rebaseOpenCutoffs(cutoffHour: number, timezone: string): Promise<void> {
  // Missed-ness must stay monotonic: rows whose cutoff already passed are terminal (they may
  // already have spawned a make-up). Only future rows adopt the new cutoff. Take the values just
  // written rather than getAppSettings(), which may still serve a stale cached read.
  const now = Date.now();
  // One write per delivery date, not per row: prod holds thousands of future rows, and a
  // row-by-row loop could outrun the request.
  const dates = await db.selectDistinct({ deliveryDate: deliveries.deliveryDate })
    .from(deliveries).where(cutoffOpenSql(now));
  for (const { deliveryDate } of dates) {
    // Re-check cutoffAt > now (same captured `now`) on the write itself: if a row's
    // cutoff lapsed between the SELECT and here, it may have already spawned a make-up
    // via reconcileMakeups running concurrently, making it terminal — overwriting it with
    // a new future cutoff would un-terminal-ize it and double-count a paid drop.
    await db.update(deliveries)
      .set({ cutoffAt: cutoffMsFor(deliveryDate, cutoffHour, timezone) })
      .where(and(eq(deliveries.deliveryDate, deliveryDate), cutoffOpenSql(now)));
  }
}
