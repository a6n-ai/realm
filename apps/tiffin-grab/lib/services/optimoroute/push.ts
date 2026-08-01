import { dailyLabelSheet, type DeliveryLabel } from "@/lib/services/daily-labels.service";
import { getOptimoRouteConfig, looksUpstairs, stopDuration } from "./config";
import { getRoutes, type OptimoOrderPayload } from "./client";

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
  /** False when no menu week is released — dishes and therefore plan labels are unknown. */
  resolvable: boolean;
  create: PlannedOrder[];
  update: PlannedOrder[];
  /** On OptimoRoute for this date but no longer ours: paused, skipped, or cancelled. */
  remove: { orderNo: string; driver: string | null; address: string | null }[];
  /** Present on both sides — the count that should be the bulk of a normal day. */
  unchangedCount: number;
};

/**
 * One label per tiffin, but ONE OptimoRoute order per delivery: a 2-person order is a
 * single stop at a single door. Deduping on deliveryPublicId is what keeps the route from
 * showing the same address twice.
 */
function oneLabelPerDelivery(labels: DeliveryLabel[]): DeliveryLabel[] {
  const seen = new Set<string>();
  return labels.filter((l) => {
    if (seen.has(l.deliveryPublicId)) return false;
    seen.add(l.deliveryPublicId);
    return true;
  });
}

/** 10 digits, country code stripped — the format the driver app dials. */
export function normalisePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.toString().replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits;
}

export async function buildPlannedOrders(date: string): Promise<{
  resolvable: boolean;
  orders: PlannedOrder[];
}> {
  const [sheet, cfg] = await Promise.all([dailyLabelSheet(date), getOptimoRouteConfig()]);
  const stops = oneLabelPerDelivery(sheet.labels);

  const orders = stops.map((label) => {
    const notes = label.deliveryNotes ?? "";
    const durationMins = stopDuration(cfg.duration, {
      city: label.city,
      upstairs: looksUpstairs(notes),
    });
    const phone = normalisePhone(label.phone);
    // The meal summary a driver can read at the door without opening the tiffin.
    const plan = `${label.planName} · ${label.mealSizeName}`;

    return {
      orderNo: label.deliveryPublicId,
      customerName: label.customerName,
      address: `${label.addressLine}, ${label.city} ${label.postalCode}`,
      city: label.city,
      postalCode: label.postalCode,
      durationMins,
      notes,
      phone: phone || null,
      plan,
      payload: {
        // MERGE, not SYNC: SYNC replaces every field, which would blank anything a
        // dispatcher set by hand in OptimoRoute (assigned driver, time window).
        operation: "MERGE" as const,
        orderNo: label.deliveryPublicId,
        date,
        duration: durationMins,
        notes,
        ...(phone ? { phone } : {}),
        location: {
          address: `${label.addressLine}, ${label.city} ${label.postalCode}`,
          locationName: label.customerName,
        },
        // Mapping preserved from the Route Maker sheet — drivers read these fields in the
        // OptimoRoute mobile app, so changing the slots changes what they see at the door.
        customField1: phone,
        customField2: label.customerName,
        customField4: plan,
      } satisfies OptimoOrderPayload,
    };
  });

  return { resolvable: sheet.menuWeekPublicId != null, orders };
}

/** What a push would do, without doing any of it. */
export async function previewPush(date: string): Promise<PushPreview> {
  const [{ resolvable, orders }, routes] = await Promise.all([
    buildPlannedOrders(date),
    getRoutes(date),
  ]);

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
  const remove = [...theirs.entries()]
    .filter(([orderNo]) => !ours.has(orderNo))
    .map(([orderNo, meta]) => ({ orderNo, ...meta }));

  return {
    date,
    resolvable,
    create,
    update,
    remove,
    unchangedCount: update.length,
  };
}
