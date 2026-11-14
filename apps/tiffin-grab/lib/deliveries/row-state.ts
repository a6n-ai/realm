import { sql } from "drizzle-orm";
import { deliveries, orders } from "@/db/schema";

type Order = typeof orders.$inferSelect;
type Delivery = typeof deliveries.$inferSelect;

/** An ordinary delivery a holiday added at plan end points back at this row: its tiffins are already re-homed. */
export const HAS_HOLIDAY_EXTRA = sql`exists (select 1 from deliveries hx where hx.holiday_extra_for_delivery_id = ${deliveries.id})`;

/**
 * A row whose tiffin already left: merged into another trip, replaced by a make-up, or stood in
 * for by the days a holiday added. It keeps its date (and its status) but carries nothing, so it
 * must never be put back on the schedule.
 */
export const MOVED_AWAY = sql`(${deliveries.mergedIntoDeliveryId} is not null or exists (select 1 from deliveries mv where mv.makeup_for_delivery_id = ${deliveries.id} or mv.holiday_extra_for_delivery_id = ${deliveries.id}))`;

/**
 * A delivery row still holds its date: not cancelled, and its tiffin was not handed to
 * another row (merged, made up, or given a holiday's extra day). A skipped day made up
 * earlier must not stretch the plan past its real last tiffin.
 */
export const HOLDS_DAY = sql`(${deliveries.status} <> 'cancelled' and not ${MOVED_AWAY})`;

/** Another row points at this one (a make-up, a merge or a holiday extra), so it cannot be dropped. */
export const POINTED_AT = sql`exists (select 1 from deliveries c where c.makeup_for_delivery_id = ${deliveries.id} or c.merged_into_delivery_id = ${deliveries.id} or c.holiday_extra_for_delivery_id = ${deliveries.id})`;

/** Ids of the rows whose tiffin a make-up or holiday-extra row in `rows` took over (the loaded form of MOVED_AWAY's second half). */
export function handedOnIds(rows: { makeupForDeliveryId: bigint | null; holidayExtraForDeliveryId: bigint | null }[]): Set<bigint> {
  const ids = new Set<bigint>();
  for (const r of rows) for (const id of [r.makeupForDeliveryId, r.holidayExtraForDeliveryId]) if (id != null) ids.add(id);
  return ids;
}

/** Every per-delivery address / drop-off override column on a delivery row; any of them set means the customer or staff changed this day. */
export const ADDRESS_OVERRIDE_COLUMNS = ["addressId", "fullName", "addressLine", "addressUnit", "city", "postalCode", "deliveryInstructions", "deliveryStrategyId", "deliveryTagId", "addressTagId", "zoneId"] as const;

export type AddressOverrideRow = Record<(typeof ADDRESS_OVERRIDE_COLUMNS)[number], unknown> & { deliveryStrategyIds: unknown[] };

export const hasAddressOverride = (row: AddressOverrideRow): boolean =>
  ADDRESS_OVERRIDE_COLUMNS.some((col) => row[col] != null) || row.deliveryStrategyIds.length > 0;

/** addressLine NULL means "inherit the order's address". */
export function effectiveAddress(
  d: Delivery,
  order: Pick<Order, "fullName" | "addressLine" | "city" | "postalCode" | "zoneId"> &
    Partial<Pick<Order, "addressUnit" | "deliveryInstructions" | "deliveryTagId" | "deliveryStrategyIds">>,
) {
  return d.addressLine === null
    ? {
        fullName: order.fullName, addressLine: order.addressLine, addressUnit: order.addressUnit ?? null, city: order.city,
        postalCode: order.postalCode, deliveryInstructions: order.deliveryInstructions ?? null, zoneId: order.zoneId,
        deliveryTagId: order.deliveryTagId ?? null,
        deliveryStrategyIds: order.deliveryStrategyIds ?? [],
      }
    : {
        // A saved address may carry no recipient name; the plan's name is still who it is for.
        fullName: d.fullName ?? order.fullName, addressLine: d.addressLine, addressUnit: d.addressUnit, city: d.city!,
        postalCode: d.postalCode!, deliveryInstructions: d.deliveryInstructions, zoneId: d.zoneId,
        // A re-addressed delivery carries its address's own drop-off, or none: the plan's
        // belongs to the plan's address, not this one.
        deliveryTagId: d.deliveryTagId, deliveryStrategyIds: d.deliveryStrategyIds,
      };
}
