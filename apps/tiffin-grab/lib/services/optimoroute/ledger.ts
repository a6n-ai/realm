import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities } from "@/db/schema";
import { labelDeliveryStatus, loadDayDeliveries } from "@/lib/services/daily-labels.service";
import { effectiveAddress } from "@/lib/services/deliveries.service";
import { getCompletionDetails, searchOrdersForDate } from "./client";
import { movedSourceIds, tiffinsMoved } from "./completions";
import { listPaymentHeld, type PaymentHeldRow } from "./drivers";
import { normalisePhone } from "./push";
import { reconcileReason, type LedgerAction, type OptimoSide, type OurSide, type ReasonGroup } from "./reconcile-reason";

export type LedgerOurRow = {
  deliveryPublicId: string;
  customerName: string;
  phone: string | null;
  orderId: string;
  tiffinUnits: number;
  ourStatus: string;
  side: OurSide;
};

export type LedgerOptimoRow = {
  id: string;
  orderNo: string | null;
  phone: string;
  driver: string | null;
  stopNumber: number | null;
  status: NonNullable<OptimoSide>["status"];
};

export type LedgerRow = {
  key: string;
  deliveryPublicId: string | null;
  optimoOrderNo: string | null;
  customerName: string;
  phone: string | null;
  orderId: string | null;
  tiffinUnits: number | null;
  ourStatus: string | null;
  optimoStatus: string | null;
  driver: string | null;
  stopNumber: number | null;
  group: ReasonGroup;
  reason: string;
  action?: LedgerAction;
  onLabels: boolean;
};

export type DayLedger = {
  date: string;
  rows: LedgerRow[];
  labelsCount: number;
  counts: Record<ReasonGroup, number>;
};

const PAYMENT_TEXT: Record<string, string> = {
  pending_verification: "Not sent — payment needs verification",
};

/** Pure: matches our rows to OptimoRoute's and names a reason for each. */
export function assembleLedger(input: {
  date: string;
  ours: LedgerOurRow[];
  paymentHeld: PaymentHeldRow[];
  optimo: LedgerOptimoRow[];
}): DayLedger {
  const byOrderNo = new Map(input.optimo.filter((o) => o.orderNo).map((o) => [o.orderNo!, o]));
  const ourIds = new Set(input.ours.map((o) => o.deliveryPublicId));
  const claimed = new Set<string>();
  for (const o of input.ours) {
    const hit = byOrderNo.get(o.deliveryPublicId);
    if (hit) claimed.add(hit.id);
  }
  // Phone fallback only over stops nobody claimed by orderNo and that are not one of our ids.
  const byPhone = new Map<string, LedgerOptimoRow[]>();
  for (const o of input.optimo) {
    if (claimed.has(o.id) || (o.orderNo && ourIds.has(o.orderNo)) || !o.phone) continue;
    byPhone.set(o.phone, [...(byPhone.get(o.phone) ?? []), o]);
  }

  // Phone fallback is strictly 1:1: one unclaimed stop and one of our orderNo-unmatched rows.
  const ourUnmatchedByPhone = new Map<string, number>();
  for (const o of input.ours) {
    const p = normalisePhone(o.phone);
    if (p && !byOrderNo.has(o.deliveryPublicId)) ourUnmatchedByPhone.set(p, (ourUnmatchedByPhone.get(p) ?? 0) + 1);
  }

  const rows: LedgerRow[] = [];
  for (const o of input.ours) {
    let stop = byOrderNo.get(o.deliveryPublicId) ?? null;
    let matchedBy: "orderNo" | "phone" = "orderNo";
    const phone = normalisePhone(o.phone);
    if (!stop && phone) {
      const candidates = byPhone.get(phone) ?? [];
      if (candidates.length === 1 && ourUnmatchedByPhone.get(phone) === 1) {
        stop = candidates[0]!;
        matchedBy = "phone";
        claimed.add(stop.id);
      } else if (candidates.length > 0) {
        for (const c of candidates) claimed.add(c.id);
        rows.push(row(o, null, { group: "needs_action", text: "Several OptimoRoute stops share this phone", action: "review" }));
        continue;
      }
    }
    const optimoSide: OptimoSide = stop
      ? { status: stop.status, driver: stop.driver, stopNumber: stop.stopNumber, matchedBy }
      : null;
    rows.push(row(o, stop, reconcileReason(o.side, optimoSide)));
  }

  for (const h of input.paymentHeld) {
    rows.push({
      key: `held:${h.deliveryPublicId}`,
      deliveryPublicId: h.deliveryPublicId,
      optimoOrderNo: null,
      customerName: h.customerName,
      phone: h.phone,
      orderId: null,
      tiffinUnits: null,
      ourStatus: "Payment not confirmed",
      optimoStatus: null,
      driver: null,
      stopNumber: null,
      group: "needs_action",
      reason: PAYMENT_TEXT[h.paymentStatus] ?? "Not sent — awaiting payment",
      onLabels: false,
    });
  }

  for (const o of input.optimo) {
    if (claimed.has(o.id) || (o.orderNo && ourIds.has(o.orderNo))) continue;
    rows.push({
      key: `opt:${o.id}`,
      deliveryPublicId: null,
      optimoOrderNo: o.orderNo,
      customerName: o.orderNo ?? o.id,
      phone: null,
      orderId: null,
      tiffinUnits: null,
      ourStatus: null,
      optimoStatus: o.status,
      driver: o.driver,
      stopNumber: o.stopNumber,
      group: "not_ours",
      reason: "Not one of our deliveries for this date",
      onLabels: false,
    });
  }

  const counts: Record<ReasonGroup, number> = { on_route: 0, done: 0, needs_action: 0, not_today: 0, not_ours: 0 };
  for (const r of rows) counts[r.group] += 1;
  return { date: input.date, rows, labelsCount: rows.filter((r) => r.onLabels).length, counts };

  function row(o: LedgerOurRow, stop: LedgerOptimoRow | null, reason: { group: ReasonGroup; text: string; action?: LedgerAction }): LedgerRow {
    return {
      key: `ours:${o.deliveryPublicId}`,
      deliveryPublicId: o.deliveryPublicId,
      optimoOrderNo: stop?.orderNo ?? null,
      customerName: o.customerName,
      phone: o.phone,
      orderId: o.orderId,
      tiffinUnits: o.tiffinUnits,
      ourStatus: o.ourStatus,
      optimoStatus: stop?.status ?? null,
      driver: stop?.driver ?? null,
      stopNumber: stop?.stopNumber ?? null,
      group: reason.group,
      reason: reason.text,
      ...(reason.action ? { action: reason.action } : {}),
      onLabels: o.side.status === "scheduled",
    };
  }
}

/** Loads both sides for a date and assembles the ledger. Three OptimoRoute calls at most (search pages + completions). */
export async function buildDayLedger(date: string): Promise<DayLedger> {
  const dayRows = await loadDayDeliveries(date, ["scheduled", "paused", "skipped", "cancelled"]);
  const ids = dayRows.map((r) => r.delivery.id);
  const mergedIds = dayRows.map((r) => r.delivery.mergedIntoDeliveryId).filter((v): v is bigint => v != null);

  const [movedIds, merged, pushed, paymentHeld, optimoOrders] = await Promise.all([
    movedSourceIds(ids),
    mergedIds.length
      ? db.select({ id: deliveries.id, date: deliveries.deliveryDate }).from(deliveries).where(inArray(deliveries.id, mergedIds))
      : Promise.resolve([]),
    ids.length
      ? db
          .selectDistinct({ deliveryId: orderActivities.deliveryId })
          .from(orderActivities)
          .where(and(inArray(orderActivities.deliveryId, ids), eq(orderActivities.type, "route_pushed")))
      : Promise.resolve([]),
    listPaymentHeld(date),
    searchOrdersForDate(date),
  ]);

  const completions = await getCompletionDetails(optimoOrders.map((o) => o.id));
  const mergedDate = new Map(merged.map((m) => [m.id, m.date]));
  const pushedIds = new Set(pushed.map((p) => p.deliveryId));
  const now = Date.now();

  const ours: LedgerOurRow[] = dayRows.map((r) => ({
    deliveryPublicId: r.delivery.publicId,
    customerName: effectiveAddress(r.delivery, r.order).fullName,
    phone: r.customerPhone ?? null,
    orderId: r.order.deploymentId,
    tiffinUnits: r.delivery.tiffinUnits,
    ourStatus: labelDeliveryStatus(r.delivery, now),
    side: {
      status: r.delivery.status,
      optimoCompletionStatus: r.delivery.optimoCompletionStatus,
      optimoCompletionNote: r.delivery.optimoCompletionNote,
      mergedIntoDate: r.delivery.mergedIntoDeliveryId != null ? (mergedDate.get(r.delivery.mergedIntoDeliveryId) ?? null) : null,
      moved: tiffinsMoved(r, movedIds) && r.delivery.mergedIntoDeliveryId == null,
      everPushed: pushedIds.has(r.delivery.id),
    },
  }));

  const optimo: LedgerOptimoRow[] = optimoOrders.map((o) => {
    const info = o.scheduleInformation ?? null;
    const done = completions.get(o.id)?.status;
    return {
      id: o.id,
      orderNo: o.data?.orderNo?.trim() || null,
      phone: normalisePhone(o.data?.customField1 ?? o.data?.phone),
      driver: info ? (info.driverName?.trim() || info.driverSerial?.trim() || null) : null,
      stopNumber: info?.stopNumber ?? null,
      status: done === "success" || done === "failed" || done === "rejected" ? done : info ? "scheduled" : "unscheduled",
    };
  });

  return assembleLedger({ date, ours, paymentHeld, optimo });
}
