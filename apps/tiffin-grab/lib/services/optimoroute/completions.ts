import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities } from "@/db/schema";
import { publishAnalyticsLive } from "@/lib/realtime/publish-inbox";
import { loadDayDeliveries, type DayDeliveryRow } from "@/lib/services/daily-labels.service";
import { skipDelivery } from "@/lib/services/deliveries.service";
import { getCompletionDetails, getOrderDetails, getRoutes, type OptimoStop } from "./client";
import { normalisePhone } from "./push";
import { tripDetail } from "./trip-notes";

// The half of the integration that turns a driver's real-world action into a real-world
// tiffin count. Driven from OUR side (scheduled and skipped deliveries for the date), not
// OptimoRoute's — the account is shared with another business (see push.ts), so looping
// over OptimoRoute's stops instead would mean wading through someone else's data to find
// ours, and would have nothing to say about a delivery OptimoRoute has no stop for at all.
//
// Status changes come only from what OptimoRoute says. The selection cutoff is the evening
// before the delivery; it locks customer changes and is not proof the driver has finished.
//
//   "success" records confirmation. A skipped row is put back to scheduled, so a pull that
//   ran before the driver closed the stop can be repaired. A day whose tiffins were already
//   moved stays skipped — restoring it would count those tiffins twice.
//
//   "failed" marks a scheduled row not delivered via skipDelivery(). A row already skipped
//   stays that way. Nothing is re-delivered automatically.
//
//   Anything else (still open, or no completion data) leaves the row alone.
//
//   No matching OptimoRoute stop at all is not a miss. That means the route was never
//   pushed (or push/match failed) — an operational gap, not evidence food didn't go out.
//   Reported separately so it gets investigated.
//
// Paused and cancelled rows are not loaded. A hold or a voided day is not revived from a
// route photo.
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
  /** What we did about it — "confirmed" for a success, "skipped" for an OptimoRoute failure. */
  action: "confirmed" | "skipped" | "skip_failed";
  skipError?: string;
  /** Tiffins on the stop and the days they cover, so a failed multi-day trip reads as such. */
  tiffinUnits: number;
  coverage: string | null;
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
  /** Matched a stop the driver has not closed. Left as it is. */
  pendingCount: number;
  /** No OptimoRoute stop found for this delivery at all — a push/sync gap, not a delivery
   *  outcome. Left untouched (falls back to the time-based default), listed by name so
   *  staff know which customers to check rather than just a bare count. */
  unmatched: { deliveryPublicId: string; customerName: string }[];
};

/** What this pull should do with one of our rows, given OptimoRoute's word for the matched stop. */
export function completionAction(
  row: { status: "scheduled" | "paused" | "skipped" | "cancelled"; optimoCompletionStatus: string | null },
  optimoStatus: string | null,
  moved: boolean,
): "confirm" | "restore" | "skip" | "pending" | "leave" {
  if (moved || row.status === "paused" || row.status === "cancelled") return "leave";
  // A recorded success on a row that is still scheduled is final. A later pull that no
  // longer sees "success" must not skip it and put the tiffin back.
  if (row.status === "scheduled" && row.optimoCompletionStatus === "success") return "leave";
  if (optimoStatus === "success") return row.status === "skipped" ? "restore" : "confirm";
  if (optimoStatus === "failed") return row.status === "scheduled" ? "skip" : "leave";
  return "pending";
}

export async function pullCompletions(
  date: string,
  actorId: bigint | null = null,
): Promise<PullCompletionsResult> {
  const rows = await loadDayDeliveries(date, ["scheduled", "skipped"]);
  const movedIds = await movedSourceIds(rows.map((row) => row.delivery.id));

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
  const unmatched: { deliveryPublicId: string; customerName: string }[] = [];

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
        unmatched.push({ deliveryPublicId: row.delivery.publicId, customerName: row.order.fullName });
        continue;
      }
    }

    const completion = completions.get(stop.id!);
    const optimoStatus = completion?.status ?? null;
    const trip = tripDetail(row);
    const moved = tiffinsMoved(row, movedIds);
    const action = completionAction(row.delivery, optimoStatus, moved);

    if (action === "pending") {
      pendingCount += 1;
      continue;
    }
    if (action === "leave") continue;

    const completedAtMs = completion?.endTime?.unixTimestamp ? completion.endTime.unixTimestamp * 1000 : now;
    const note = optimoStatus === "success" ? null : (completion?.form?.note?.trim() || null);

    if (action === "confirm" || action === "restore") {
      await db.update(deliveries).set({
        ...(action === "restore" ? { status: "scheduled" as const } : {}),
        optimoCompletionStatus: "success",
        optimoCompletedAt: completedAtMs,
        optimoCompletionNote: null,
      }).where(eq(deliveries.id, row.delivery.id));
      await db.insert(orderActivities).values({
        orderId: row.order.id,
        deliveryId: row.delivery.id,
        type: action === "restore" ? "unskipped" : "route_completed",
        note: "Confirmed delivered via OptimoRoute",
        createdBy: actorId,
      });
      outcomes.push({
        deliveryPublicId: row.delivery.publicId,
        customerName: row.order.fullName,
        optimoStatus,
        action: "confirmed",
        tiffinUnits: trip.units,
        coverage: trip.coverage,
      });
      continue;
    }

    let skipError: string | undefined;
    let skipped = false;
    try {
      // skipDelivery's cutoff lock stops a customer changing a day too late. An explicit
      // OptimoRoute failure is the dispatcher case, and it can arrive after that lock.
      await skipDelivery(row.delivery.publicId, actorId, { bypassCutoffLock: true });
      skipped = true;
    } catch (e) {
      skipError = e instanceof Error ? e.message : "Unknown error";
    }

    await db.update(deliveries).set({
      optimoCompletionStatus: optimoStatus,
      optimoCompletedAt: completedAtMs,
      optimoCompletionNote: note,
    }).where(eq(deliveries.id, row.delivery.id));
    await db.insert(orderActivities).values({
      orderId: row.order.id,
      deliveryId: row.delivery.id,
      type: "route_completed",
      note: `OptimoRoute reported delivery failed${note ? `: ${note}` : ""}${skipError ? ` (skip not applied: ${skipError})` : ""}`,
      createdBy: actorId,
    });

    outcomes.push({
      deliveryPublicId: row.delivery.publicId,
      customerName: row.order.fullName,
      optimoStatus,
      action: skipped ? "skipped" : "skip_failed",
      skipError,
      tiffinUnits: trip.units,
      coverage: trip.coverage,
    });
  }

  if (outcomes.length) publishAnalyticsLive();
  return { date, outcomes, ambiguous, pendingCount, unmatched };
}

function tiffinsMoved(row: DayDeliveryRow, movedIds: Set<bigint>): boolean {
  return row.delivery.mergedIntoDeliveryId != null || row.delivery.tiffinUnits === 0 || movedIds.has(row.delivery.id);
}

/** Source rows that already spawned a make-up. Restoring one would count its tiffins twice. */
async function movedSourceIds(deliveryIds: bigint[]): Promise<Set<bigint>> {
  if (deliveryIds.length === 0) return new Set();
  const children = await db
    .select({ sourceId: deliveries.makeupForDeliveryId })
    .from(deliveries)
    .where(inArray(deliveries.makeupForDeliveryId, deliveryIds));
  const ids = new Set<bigint>();
  for (const child of children) {
    if (child.sourceId != null) ids.add(child.sourceId);
  }
  return ids;
}
