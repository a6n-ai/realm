// Past deliveries nobody confirmed went out: the Orders "Missed deliveries" tab.
//
// Computed on read, no stored status. A row is missed when its day is over (before today in the
// app timezone), it is still `scheduled`, and OptimoRoute never said `success`. That is either a
// stop never sent to OptimoRoute, or one sent with no completion back. An OptimoRoute `failed`
// already turns the row into a hold with its tiffin in the pool, so it is not listed here.
// A row a free tiffin was given for is settled and drops off.
import { and, asc, desc, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { ValidationError, zonedDateIso } from "@foundry/commons";
import { db } from "@/db/client";
import { deliveries, orderActivities, orders, plans } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { pullCompletions } from "@/lib/services/optimoroute/completions";
import { rescheduleDelivery } from "@/lib/services/deliveries.service";
import { missedWhere } from "@/lib/services/missed-where";

export type MissedKind = "not_sent" | "no_confirmation";

export type MissedDeliveryRow = {
  deliveryPublicId: string;
  deliveryDate: string;
  tiffinUnits: number;
  kind: MissedKind;
  driver: string | null;
  orderPublicId: string;
  orderCode: string;
  customerName: string;
  planName: string;
};

async function appToday(): Promise<string> {
  return zonedDateIso(Date.now(), (await getAppSettings()).timezone);
}

export async function countMissedDeliveries(visible: "all" | string[]): Promise<number> {
  if (visible !== "all" && visible.length === 0) return 0;
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(deliveries)
    .innerJoin(orders, eq(orders.id, deliveries.orderId))
    .where(missedWhere(await appToday(), visible));
  return count;
}

export async function listMissedDeliveries(visible: "all" | string[]): Promise<MissedDeliveryRow[]> {
  if (visible !== "all" && visible.length === 0) return [];
  const rows = await db
    .select({
      deliveryPublicId: deliveries.publicId,
      deliveryDate: deliveries.deliveryDate,
      tiffinUnits: deliveries.tiffinUnits,
      routeSyncedAt: deliveries.routeSyncedAt,
      driver: sql<string | null>`coalesce(${deliveries.routeDriverName}, ${deliveries.routeDriverSerial})`,
      orderPublicId: orders.publicId,
      orderCode: orders.deploymentId,
      customerName: orders.fullName,
      planName: plans.name,
    })
    .from(deliveries)
    .innerJoin(orders, eq(orders.id, deliveries.orderId))
    .innerJoin(plans, eq(plans.id, orders.planId))
    .where(missedWhere(await appToday(), visible))
    .orderBy(desc(deliveries.deliveryDate), asc(orders.deploymentId));
  return rows.map(({ routeSyncedAt, ...r }) => ({ ...r, kind: routeSyncedAt == null ? "not_sent" : "no_confirmation" }));
}

export type MissedReconcileResult = { days: number; delivered: number; notDelivered: number; stillMissed: number };

/**
 * Asks OptimoRoute about every day on the list, with the same pull Dispatch runs per day: a
 * `success` stop confirms the delivery, a `failed` stop puts it on hold with its tiffin in the
 * pool. Matching is by our order number, then phone, so stops typed into OptimoRoute by hand
 * are found too. Days are pulled one at a time; each pull reads the whole day's routes.
 */
export async function reconcileMissedDeliveries(visible: "all" | string[], actorId: bigint | null): Promise<MissedReconcileResult> {
  const missed = await listMissedDeliveries(visible);
  const ids = new Set(missed.map((r) => r.deliveryPublicId));
  const dates = [...new Set(missed.map((r) => r.deliveryDate))].sort();
  let delivered = 0;
  let notDelivered = 0;
  for (const date of dates) {
    const { outcomes } = await pullCompletions(date, actorId);
    for (const o of outcomes) {
      if (!ids.has(o.deliveryPublicId)) continue;
      if (o.action === "confirmed") delivered += 1;
      else if (o.action === "skipped") notDelivered += 1;
    }
  }
  return { days: dates.length, delivered, notDelivered, stillMissed: await countMissedDeliveries(visible) };
}

/**
 * A missed day that did not go out: put it on hold, then move its tiffin to `date` with the same
 * Move the order page uses. The hold is written here rather than through the admin "Not delivered"
 * action, which also deletes the stop from OptimoRoute and would erase the day's route history.
 * If the move is refused (no such plan day, cutoff passed…) the day goes back to missed as it was.
 */
export async function moveMissedDelivery(deliveryPublicId: string, date: string, actorId: bigint | null): Promise<{ carriedOn: string }> {
  const today = await appToday();
  const held = await db.transaction(async (tx) => {
    const [row] = await tx.update(deliveries).set({ status: "skipped" })
      .where(and(
        eq(deliveries.publicId, deliveryPublicId),
        eq(deliveries.status, "scheduled"),
        lt(deliveries.deliveryDate, today),
        or(isNull(deliveries.optimoCompletionStatus), ne(deliveries.optimoCompletionStatus, "success")),
      ))
      .returning({ id: deliveries.id, orderId: deliveries.orderId, organizationId: deliveries.organizationId, deliveryDate: deliveries.deliveryDate });
    if (!row) throw new ValidationError("This day is no longer missed. Refresh the list.");
    const [activity] = await tx.insert(orderActivities).values({
      orderId: row.orderId, deliveryId: row.id, type: "skipped", createdBy: actorId, organizationId: row.organizationId,
      note: `Missed ${row.deliveryDate}: not delivered, moving to ${date}`,
    }).returning({ id: orderActivities.id });
    return { id: row.id, activityId: activity!.id };
  });
  try {
    const { carriedOn } = await rescheduleDelivery(deliveryPublicId, date, actorId);
    return { carriedOn };
  } catch (e) {
    await db.transaction(async (tx) => {
      await tx.update(deliveries).set({ status: "scheduled" }).where(and(eq(deliveries.id, held.id), eq(deliveries.status, "skipped")));
      await tx.delete(orderActivities).where(eq(orderActivities.id, held.activityId));
    });
    throw e;
  }
}
