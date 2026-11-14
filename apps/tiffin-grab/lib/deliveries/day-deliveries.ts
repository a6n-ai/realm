import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, mealSizes, orders, plans, users } from "@/db/schema";
import { fulfillmentReadyOrder } from "@/lib/orders/fulfillment";
import { effectiveAddress } from "@/lib/deliveries/row-state";
import { dropOffTexts } from "@/lib/deliveries/address-drop-off.service";
import { labelDeliveryStatus, type LabelDeliveryStatus } from "@/lib/deliveries/label-status";

export type DayDeliveryRow = {
  delivery: typeof deliveries.$inferSelect;
  order: typeof orders.$inferSelect;
  planName: string;
  mealSizeName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  /** The trip address's drop-off ("Apartment: Lobby"), for OptimoRoute's delivery-type field. */
  dropOff: string | null;
  /** What the driver reads: drop-off, then the address's own instructions. Same on label and route. */
  driverNote: string | null;
};

export function driverNote(dropOff: string | null, instructions: string | null | undefined): string | null {
  return [dropOff, instructions?.trim()].filter(Boolean).join(" · ") || null;
}

/**
 * Every scheduled delivery for one date, with who and where — the transpose of the
 * per-order reads the rest of the app does.
 *
 * Deliberately independent of the menu week: an address is known whether or not a menu is
 * released, and route planning must not silently return nothing because the kitchen has
 * not published the week yet.
 */
const SCHEDULED_ONLY = ["scheduled"] as const;
/** The status section keeps a past day visible. The packing sheet stays scheduled-only. */
/** Every status shown on Daily labels and the Dispatch Day table — one list so the two pages cannot drift. */
export const STATUS_DAY_STATUSES = ["scheduled", "paused", "skipped", "cancelled"] as const;

export type DayDeliveryStatusRow = {
  deliveryPublicId: string;
  customerName: string;
  orderId: string;
  planName: string;
  mealSizeName: string;
  tiffinUnits: number;
  status: LabelDeliveryStatus;
};

export async function loadDayDeliveries(
  dateIso: string,
  statuses: readonly ("scheduled" | "paused" | "skipped" | "cancelled")[] = SCHEDULED_ONLY,
): Promise<DayDeliveryRow[]> {
  const rows = await db
    .select({
      delivery: deliveries,
      order: orders,
      planName: plans.name,
      mealSizeName: mealSizes.name,
      customerEmail: users.email,
      customerPhone: users.phone,
    })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .where(
      and(
        eq(deliveries.deliveryDate, dateIso),
        inArray(deliveries.status, [...statuses]),
        fulfillmentReadyOrder(),
      ),
    )
    .orderBy(asc(deliveries.id));

  const addresses = rows.map((r) => effectiveAddress(r.delivery, r.order));
  const dropOffs = await dropOffTexts(addresses.map((a) => ({ tagId: a.deliveryTagId, strategyIds: a.deliveryStrategyIds })));
  return rows.map((r, i) => ({ ...r, dropOff: dropOffs[i]!, driverNote: driverNote(dropOffs[i]!, addresses[i]!.deliveryInstructions) }));
}

/** Every delivery for the date, including ones the packing sheet leaves out once the day has passed. */
export async function listDayDeliveryStatuses(dateIso: string): Promise<DayDeliveryStatusRow[]> {
  return toStatusRows(await loadDayDeliveries(dateIso, STATUS_DAY_STATUSES), Date.now());
}

export function toStatusRows(rows: DayDeliveryRow[], now: number): DayDeliveryStatusRow[] {
  return rows
    .map((row) => ({
      deliveryPublicId: row.delivery.publicId,
      customerName: effectiveAddress(row.delivery, row.order).fullName,
      orderId: row.order.deploymentId,
      planName: row.planName,
      mealSizeName: row.mealSizeName,
      tiffinUnits: row.delivery.tiffinUnits,
      status: labelDeliveryStatus(row.delivery, now),
    }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName) || a.orderId.localeCompare(b.orderId));
}
