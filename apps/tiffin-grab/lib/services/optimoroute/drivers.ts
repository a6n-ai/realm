import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orders, payments, users } from "@/db/schema";
import { PAYMENT_REVIEW_STATUSES } from "@/lib/orders/display-status";
import { loadDayDeliveries } from "@/lib/services/daily-labels.service";
import { loadTripDetails, stopNotes } from "./trip-notes";
import { effectiveAddress } from "@/lib/services/deliveries.service";

// OptimoRoute exposes no driver-roster endpoint — the only place a driver's
// serial/name pair exists is on a route it has already planned, which
// pull.ts already writes into deliveries.routeDriverSerial/routeDriverName.
// This reads that back as a picklist instead of keeping a separate table
// that would just be a stale cache of the same information.
export type KnownDriver = { driverSerial: string; driverName: string | null };

export async function listKnownDrivers(): Promise<KnownDriver[]> {
  // Not selectDistinct on the pair: a renamed/corrected driver name would
  // then surface as two rows for the same serial, colliding as React keys
  // in the picklist. Sort newest-synced first and keep one row per serial
  // so a rename wins over the stale name instead of both surviving.
  const rows = await db
    .select({
      driverSerial: deliveries.routeDriverSerial,
      driverName: deliveries.routeDriverName,
    })
    .from(deliveries)
    .where(isNotNull(deliveries.routeDriverSerial))
    .orderBy(sql`${deliveries.routeSyncedAt} DESC NULLS LAST`);

  const bySerial = new Map<string, KnownDriver>();
  for (const r of rows) {
    if (r.driverSerial == null) continue;
    if (!bySerial.has(r.driverSerial)) bySerial.set(r.driverSerial, { driverSerial: r.driverSerial, driverName: r.driverName });
  }

  return [...bySerial.values()].sort((a, b) => a.driverSerial.localeCompare(b.driverSerial));
}

export type DispatchRow = {
  orderNo: string;
  customerName: string;
  phone: string | null;
  /** Tiffins on this stop; a trip carrying several eating days is more than one per person. */
  tiffinUnits: number;
  coveredDates: string[];
  /** "Covers Mon + Tue · 2 tiffins"; null on a plain single-day stop. */
  coverage: string | null;
  /** Same text the push sends: unit, driver note, coverage, per-day dishes. */
  notes: string;
  routeDriverSerial: string | null;
  routeDriverName: string | null;
  routeStopNumber: number | null;
  routeSyncedAt: number | null;
};

/** Same scheduled-deliveries read buildPlannedOrders uses, plus the driver fields the push preview doesn't need. */
export async function buildDispatchRows(date: string): Promise<DispatchRow[]> {
  const rows = await loadDayDeliveries(date);
  const trips = await loadTripDetails(rows);
  return rows.map((row) => {
    const trip = trips.get(row.delivery.id)!;
    const address = effectiveAddress(row.delivery, row.order);
    return {
      orderNo: row.delivery.publicId,
      customerName: address.fullName,
      phone: row.customerPhone ?? null,
      tiffinUnits: trip.units,
      coveredDates: trip.covered,
      coverage: trip.coverage,
      notes: stopNotes(address.addressUnit, row.driverNote, trip),
      routeDriverSerial: row.delivery.routeDriverSerial,
      routeDriverName: row.delivery.routeDriverName,
      routeStopNumber: row.delivery.routeStopNumber,
      routeSyncedAt: row.delivery.routeSyncedAt,
    };
  });
}

export type PaymentHeldRow = {
  deliveryPublicId: string;
  orderPublicId: string;
  customerName: string;
  phone: string | null;
  paymentStatus: (typeof PAYMENT_REVIEW_STATUSES)[number];
  amount: string;
  reference: string | null;
};

/**
 * Scheduled for the date but kept off labels and OptimoRoute by fulfillmentReadyOrder()
 * because the payment is not confirmed — listed on Dispatch so staff know why a customer
 * is missing from the route rather than assuming the push failed.
 */
export async function listPaymentHeld(date: string): Promise<PaymentHeldRow[]> {
  const rows = await db
    .select({
      deliveryPublicId: deliveries.publicId,
      orderPublicId: orders.publicId,
      customerName: orders.fullName,
      phone: users.phone,
      paymentStatus: payments.status,
      amount: payments.amount,
      reference: payments.reference,
    })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .where(
      and(
        eq(deliveries.deliveryDate, date),
        eq(deliveries.status, "scheduled"),
        eq(orders.status, "active"),
        inArray(payments.status, [...PAYMENT_REVIEW_STATUSES]),
      ),
    )
    .orderBy(orders.fullName);
  return rows as PaymentHeldRow[];
}

export { assignDriver } from "./push";
