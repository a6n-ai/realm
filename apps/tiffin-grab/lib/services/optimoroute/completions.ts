import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities } from "@/db/schema";
import { loadDayDeliveries, type DayDeliveryRow } from "@/lib/services/daily-labels.service";
import { skipDelivery } from "@/lib/services/deliveries.service";
import { getCompletionDetails, getOrderDetails, getRoutes, type OptimoStop } from "./client";
import { normalisePhone } from "./push";

// The half of the integration that turns a driver's real-world action into a real-world
// tiffin count. Driven from OUR side (every scheduled delivery for the date), not
// OptimoRoute's — the account is shared with another business (see push.ts), so looping
// over OptimoRoute's stops instead would mean wading through someone else's data to find
// ours, and would have nothing to say about a delivery OptimoRoute has no stop for at all.
//
// Three outcomes per delivery, deliberately not treated the same:
//
//   "success" only records confirmation — the cutoff-passed-and-still-scheduled default
//   (lib/services/tiffin-counts.ts) already counts the delivery, and stays the source of
//   truth for billing. A late/missing sync must never make an already-delivered tiffin
//   look undelivered.
//
//   "failed", or still not "success" once the cutoff has passed (a driver never got to it,
//   or never closed it out) — both call the exact same skipDelivery() a dispatcher would
//   use by hand, which flips the row to "skipped" and pools the tiffin for a make-up. Before
//   cutoff, "not success yet" just means the day isn't over — left alone, not a miss.
//
//   No matching OptimoRoute stop at all is NOT treated as a miss. That means the route was
//   never pushed (or push/match failed) — an operational gap, not evidence food didn't go
//   out. Auto-skipping on missing data would silently pool tiffins for a real, delivered day
//   any time staff forgot to click "Send stops". Reported separately so it gets investigated.
//
// Matching is phone-first, not orderNo-first, because today's real OptimoRoute account has
// stops entered by the legacy spreadsheet process, keyed by customer name — not by anything
// this app generates. Once this app is the only thing pushing (orderNo = our delivery's
// publicId, see push.ts), the exact-publicId path below is what actually fires; the
// phone fallback keeps working for the migration period without needing a second run.

export type CompletionOutcome = {
  deliveryPublicId: string;
  customerName: string;
  /** What OptimoRoute actually said — "success" | "failed" | "scheduled" (never attempted) | null (no data at all). */
  optimoStatus: string | null;
  /** What we did about it — "confirmed" for a success, "skipped" for anything else after cutoff. */
  action: "confirmed" | "skipped" | "skip_failed";
  skipError?: string;
};

export type CompletionAmbiguous = {
  phone: string;
  deliveryPublicId: string;
  candidateCount: number;
};

export type PullCompletionsResult = {
  date: string;
  outcomes: CompletionOutcome[];
  /** One of our deliveries' phone matched more than one OptimoRoute stop for the date — never guessed. */
  ambiguous: CompletionAmbiguous[];
  /** Matched a stop, but its cutoff hasn't passed yet and OptimoRoute hasn't confirmed success —
   *  too early to call it a miss. Re-pull after cutoff. */
  pendingCount: number;
  /** No OptimoRoute stop found for this delivery at all — a push/sync gap, not a delivery
   *  outcome. Left untouched (falls back to the time-based default), reported for follow-up. */
  unmatchedCount: number;
};

export async function pullCompletions(
  date: string,
  actorId: bigint | null = null,
): Promise<PullCompletionsResult> {
  const rows = await loadDayDeliveries(date);

  const routes = await getRoutes(date);
  const stops = routes.flatMap((r) => r.stops ?? []).filter((s) => s.id && s.orderNo && s.orderNo !== "-");
  const ids = stops.map((s) => s.id!);

  const [orderDetails, completions] = await Promise.all([
    getOrderDetails(ids),
    getCompletionDetails(ids),
  ]);

  const stopByOrderNo = new Map<string, OptimoStop>();
  const stopsByPhone = new Map<string, OptimoStop[]>();
  for (const stop of stops) {
    stopByOrderNo.set(stop.orderNo!, stop);
    const phone = normalisePhone(orderDetails.get(stop.id!)?.customField1);
    if (!phone) continue;
    const existing = stopsByPhone.get(phone);
    if (existing) existing.push(stop);
    else stopsByPhone.set(phone, [stop]);
  }

  const now = Date.now();
  const outcomes: CompletionOutcome[] = [];
  const ambiguous: CompletionAmbiguous[] = [];
  let pendingCount = 0;
  let unmatchedCount = 0;

  for (const row of rows) {
    const phone = normalisePhone(row.customerPhone);
    let stop = stopByOrderNo.get(row.delivery.publicId);
    if (!stop) {
      const candidates = phone ? stopsByPhone.get(phone) : undefined;
      if (candidates && candidates.length === 1) {
        stop = candidates[0];
      } else if (candidates && candidates.length > 1) {
        ambiguous.push({ phone, deliveryPublicId: row.delivery.publicId, candidateCount: candidates.length });
        continue;
      } else {
        unmatchedCount += 1;
        continue;
      }
    }

    const completion = completions.get(stop.id!);
    const optimoStatus = completion?.status ?? null;
    const isSuccess = optimoStatus === "success";
    const cutoffPassed = row.delivery.cutoffAt <= now;

    if (!isSuccess && !cutoffPassed) {
      // Not confirmed yet, but the day isn't over — could still happen. Not a miss.
      pendingCount += 1;
      continue;
    }

    const completedAtMs = completion?.endTime?.unixTimestamp ? completion.endTime.unixTimestamp * 1000 : now;
    const note = isSuccess ? null : (completion?.form?.note?.trim() || null);

    await db.update(deliveries).set({
      optimoCompletionStatus: optimoStatus,
      optimoCompletedAt: completedAtMs,
      optimoCompletionNote: note,
    }).where(eq(deliveries.id, row.delivery.id));

    if (isSuccess) {
      await db.insert(orderActivities).values({
        orderId: row.order.id,
        deliveryId: row.delivery.id,
        type: "route_completed",
        note: "Confirmed delivered via OptimoRoute",
        createdBy: actorId,
      });
      outcomes.push({
        deliveryPublicId: row.delivery.publicId,
        customerName: row.order.fullName,
        optimoStatus,
        action: "confirmed",
      });
      continue;
    }

    // Cutoff has passed and OptimoRoute never confirmed success — explicit failure or a
    // stop that just never got closed out; either way, no tiffin went out.
    let skipError: string | undefined;
    let skipped = false;
    try {
      // skipDelivery()'s cutoff lock exists to stop a customer self-service-cancelling
      // too late — it must not block this reconciliation, which by construction (the
      // cutoffPassed gate above) only ever runs once that cutoff has already passed.
      await skipDelivery(row.delivery.publicId, actorId, { bypassCutoffLock: true });
      skipped = true;
    } catch (e) {
      // Already paused/cancelled/skipped by something else in the meantime — the
      // completion is still recorded above, just nothing left to flip.
      skipError = e instanceof Error ? e.message : "Unknown error";
    }

    const reason =
      optimoStatus === "failed"
        ? `OptimoRoute reported delivery failed${note ? `: ${note}` : ""}`
        : "Cutoff passed with no delivery confirmation from OptimoRoute";
    await db.insert(orderActivities).values({
      orderId: row.order.id,
      deliveryId: row.delivery.id,
      type: "route_completed",
      note: `${reason}${skipError ? ` (skip not applied: ${skipError})` : ""}`,
      createdBy: actorId,
    });

    outcomes.push({
      deliveryPublicId: row.delivery.publicId,
      customerName: row.order.fullName,
      optimoStatus,
      action: skipped ? "skipped" : "skip_failed",
      skipError,
    });
  }

  return { date, outcomes, ambiguous, pendingCount, unmatchedCount };
}
