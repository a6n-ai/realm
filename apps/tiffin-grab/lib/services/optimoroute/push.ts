import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities } from "@/db/schema";
import { loadDayDeliveries } from "@/lib/services/daily-labels.service";
import { effectiveAddress } from "@/lib/services/deliveries.service";
import { getOptimoRouteConfig, looksUpstairs, stopDuration } from "./config";
import {
  createOrder,
  deleteOrder,
  getRoutes,
  withConcurrency,
  type OptimoOrderPayload,
} from "./client";

// Step 1 is preview-only: this module reads both sides and reports the difference. It
// contains no create/update/delete call — pushing is the next step, and keeping the diff
// honest first is what makes that step safe to turn on.

export type PlannedOrder = {
  /** Stable across renames, unlike the spreadsheet's "43 Yatharth Aggarwal". */
  orderNo: string;
  customerName: string;
  address: string;
  city: string;
  postalCode: string;
  durationMins: number;
  notes: string;
  phone: string | null;
  plan: string;
  payload: OptimoOrderPayload;
};

export type PushPreview = {
  date: string;
  create: PlannedOrder[];
  update: PlannedOrder[];
  /**
   * On OptimoRoute for this date but not in our scheduled set. Two very different kinds,
   * hence `ours`: a delivery of ours that was paused/skipped/cancelled, versus a stop
   * created by something else entirely. The OptimoRoute account is shared with another
   * business, so most entries here are usually not ours to touch.
   */
  remove: { orderNo: string; driver: string | null; address: string | null; ours: boolean }[];
  /** Present on both sides — the count that should be the bulk of a normal day. */
  unchangedCount: number;
};

/** 10 digits, country code stripped — the format the driver app dials. */
export function normalisePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.toString().replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits;
}

/**
 * One OptimoRoute order per DELIVERY — a 2-person order prints two labels but is one stop
 * at one door. Built from loadDayDeliveries rather than the label sheet, so a week the
 * kitchen has not released still produces a full route.
 */
export async function buildPlannedOrders(date: string): Promise<PlannedOrder[]> {
  const [rows, cfg] = await Promise.all([loadDayDeliveries(date), getOptimoRouteConfig()]);

  return rows.map((row) => {
    const address = effectiveAddress(row.delivery, row.order);
    const notes = row.customerNotes?.trim() ?? "";
    const durationMins = stopDuration(cfg.duration, {
      city: address.city,
      upstairs: looksUpstairs(notes),
    });
    const phone = normalisePhone(row.customerPhone);
    // The summary a driver reads at the door without opening the tiffin.
    const plan = `${row.planName} · ${row.mealSizeName}`;
    const fullAddress = `${address.addressLine}, ${address.city} ${address.postalCode}`;

    return {
      orderNo: row.delivery.publicId,
      customerName: address.fullName,
      address: fullAddress,
      city: address.city,
      postalCode: address.postalCode,
      durationMins,
      notes,
      phone: phone || null,
      plan,
      payload: {
        // MERGE, not SYNC: SYNC replaces every field, which would blank anything a
        // dispatcher set by hand in OptimoRoute (assigned driver, time window).
        operation: "MERGE" as const,
        orderNo: row.delivery.publicId,
        date,
        duration: durationMins,
        notes,
        ...(phone ? { phone } : {}),
        location: { address: fullAddress, locationName: address.fullName },
        // Mapping preserved from the Route Maker sheet — drivers read these fields in the
        // OptimoRoute mobile app, so changing the slots changes what they see at the door.
        customField1: phone,
        customField2: address.fullName,
        customField4: plan,
      } satisfies OptimoOrderPayload,
    };
  });
}

/** What a push would do, without doing any of it. */
export async function previewPush(date: string): Promise<PushPreview> {
  const [orders, routes] = await Promise.all([buildPlannedOrders(date), getRoutes(date)]);

  const theirs = new Map<string, { driver: string | null; address: string | null }>();
  for (const route of routes) {
    const driver = route.driverName ?? route.driverSerial ?? null;
    for (const stop of route.stops ?? []) {
      const orderNo = stop.orderNo?.trim();
      if (!orderNo || orderNo === "-") continue;
      theirs.set(orderNo, { driver, address: stop.address ?? null });
    }
  }

  const ours = new Set(orders.map((o) => o.orderNo));
  const create = orders.filter((o) => !theirs.has(o.orderNo));
  const update = orders.filter((o) => theirs.has(o.orderNo));

  const orphanNos = [...theirs.keys()].filter((orderNo) => !ours.has(orderNo));
  // A stop is "ours" when it names a delivery in our database — including one that is
  // paused or skipped, which is precisely the case worth removing. Anything else belongs
  // to another system sharing this OptimoRoute account and must not be swept up.
  const known =
    orphanNos.length === 0
      ? []
      : await db
          .select({ publicId: deliveries.publicId })
          .from(deliveries)
          .where(inArray(deliveries.publicId, orphanNos));
  const knownIds = new Set(known.map((k) => k.publicId));

  const remove = orphanNos.map((orderNo) => ({
    orderNo,
    ...theirs.get(orderNo)!,
    ours: knownIds.has(orderNo),
  }));

  return {
    date,
    create,
    update,
    remove,
    unchangedCount: update.length,
  };
}

export type PushOutcome = {
  orderNo: string;
  customerName: string;
  ok: boolean;
  message: string;
};

export type PushResult = {
  date: string;
  pushed: number;
  failed: number;
  /** Stale stops found but NOT touched — removal is a separate, confirmed action. */
  staleCount: number;
  outcomes: PushOutcome[];
};

/**
 * Sends every scheduled delivery for the date as a MERGE upsert. Idempotent: re-running
 * with unchanged data is a no-op on OptimoRoute's side, so a half-failed push is fixed by
 * pressing the button again rather than by reasoning about which half landed.
 *
 * Does NOT delete. Stale stops are counted and reported; removing them is its own action
 * because it takes a stop off a driver's route.
 */
export async function pushDay(date: string, actorId: bigint | null = null): Promise<PushResult> {
  const preview = await previewPush(date);
  const targets = [...preview.create, ...preview.update];

  const outcomes = await withConcurrency(targets, async (order): Promise<PushOutcome> => {
    try {
      await createOrder(order.payload);
      return { orderNo: order.orderNo, customerName: order.customerName, ok: true, message: "Sent" };
    } catch (e) {
      return {
        orderNo: order.orderNo,
        customerName: order.customerName,
        ok: false,
        message: e instanceof Error ? e.message : "Unknown error",
      };
    }
  });

  const failed = outcomes.filter((o) => !o.ok);
  await recordPushActivities(date, outcomes, actorId);

  return {
    date,
    pushed: outcomes.length - failed.length,
    failed: failed.length,
    staleCount: preview.remove.length,
    outcomes,
  };
}

export type RemoveResult = {
  date: string;
  removed: number;
  failed: number;
  /** Asked for but no longer stale by the time we checked — deliberately left alone. */
  skipped: string[];
  outcomes: PushOutcome[];
};

/**
 * Takes stops off OptimoRoute. The destructive arm, so it is explicit in three ways:
 * the caller passes the exact orderNos, staleness is re-checked here against a fresh
 * read, and anything that has become live again is skipped rather than deleted.
 *
 * That re-check is the important one. A preview rendered a minute ago can be out of date —
 * a customer may have un-paused, or another admin may have pushed — and deleting from a
 * stale list would take a real stop off a driver's route.
 */
export async function removeStops(
  date: string,
  orderNos: string[],
  actorId: bigint | null = null,
): Promise<RemoveResult> {
  if (orderNos.length === 0) {
    return { date, removed: 0, failed: 0, skipped: [], outcomes: [] };
  }

  const preview = await previewPush(date);
  const staleNow = new Set(preview.remove.map((r) => r.orderNo));
  const requested = new Set(orderNos);

  const targets = [...requested].filter((o) => staleNow.has(o));
  const skipped = [...requested].filter((o) => !staleNow.has(o));

  const outcomes = await withConcurrency(targets, async (orderNo): Promise<PushOutcome> => {
    try {
      await deleteOrder(orderNo);
      return { orderNo, customerName: orderNo, ok: true, message: "Removed" };
    } catch (e) {
      return {
        orderNo,
        customerName: orderNo,
        ok: false,
        message: e instanceof Error ? e.message : "Unknown error",
      };
    }
  });

  const failed = outcomes.filter((o) => !o.ok);
  // A stale stop usually still HAS a delivery row (paused or skipped, not deleted), so
  // most removals land in that delivery's log. Stops created outside this app match
  // nothing and are reported in the result only.
  await recordPushActivities(
    date,
    outcomes.map((o) => ({
      ...o,
      message: o.ok ? "removed" : o.message,
    })),
    actorId,
    (o) => (o.ok ? `Removed from OptimoRoute for ${date}` : `OptimoRoute removal failed: ${o.message}`),
  );

  return {
    date,
    removed: outcomes.length - failed.length,
    failed: failed.length,
    skipped,
    outcomes,
  };
}

/**
 * One activity row per delivery, so "why did this customer not get delivered?" is
 * answerable from the same log as everything else rather than from a server log nobody
 * reads. Failures always logged; successes too, since a route is a claim about the day.
 */
async function recordPushActivities(
  date: string,
  outcomes: PushOutcome[],
  actorId: bigint | null,
  describe: (o: PushOutcome) => string = (o) =>
    o.ok ? `Sent to OptimoRoute for ${date}` : `OptimoRoute push failed: ${o.message}`,
): Promise<void> {
  if (outcomes.length === 0) return;

  // orderId is NOT NULL on order_activities, so both ids come from one lookup.
  const found = await db
    .select({ id: deliveries.id, publicId: deliveries.publicId, orderId: deliveries.orderId })
    .from(deliveries)
    .where(inArray(deliveries.publicId, outcomes.map((o) => o.orderNo)));
  const byPublicId = new Map(found.map((r) => [r.publicId, r]));

  const rows = outcomes.flatMap((o) => {
    const delivery = byPublicId.get(o.orderNo);
    if (!delivery) return [];
    return [{
      orderId: delivery.orderId,
      deliveryId: delivery.id,
      type: "route_pushed" as const,
      note: describe(o),
      createdBy: actorId,
    }];
  });
  if (rows.length === 0) return;

  await db.insert(orderActivities).values(rows);
}
