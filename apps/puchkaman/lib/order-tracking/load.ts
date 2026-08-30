import type { TrackedOrder, TrackingAction, TrackingStep } from "@realm/order-tracking";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orderItems, orders, payments } from "@/db/schema";

type OrderRow = typeof orders.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

const num = (v: string | null | undefined): number => (v ? Number(v) : 0);

/**
 * Builds the customer-facing view of an order. Access has already been decided
 * by the Better Auth tracking plugin before this runs — nothing here re-checks
 * it, and nothing here returns the phone number the PIN is derived from.
 */
export async function loadTrackedOrder(publicId: string): Promise<TrackedOrder | null> {
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
  if (!order) return null;

  const [items, pays] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    db.select().from(payments).where(eq(payments.orderId, order.id)),
  ]);

  const paid = pays
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + num(p.amount), 0);
  const total = num(order.total);
  const balanceDue = Math.max(0, Math.round((total - paid) * 100) / 100);

  const snapshot = order.pricingSnapshot;

  return {
    reference: order.publicId,
    placedAt: order.createdAt,
    steps: buildSteps(order, pays),
    terminal: isTerminal(order.status),
    lines: items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      lineTotal: num(i.lineTotal),
      modifiers: i.selectedModifiers.map((m) => m.name),
    })),
    totals: {
      currency: snapshot?.currency ?? "CAD",
      subtotal: num(order.subtotal),
      tax: num(order.tax),
      discount: snapshot?.discountAmount,
      total,
      balanceDue,
    },
    fulfillment: {
      kind: order.fulfillment,
      summary: fulfillmentSummary(order),
      address: order.deliveryAddress ?? undefined,
      scheduledFor: order.scheduledFor ?? undefined,
      lat: order.deliveryLat != null ? Number(order.deliveryLat) : undefined,
      lng: order.deliveryLng != null ? Number(order.deliveryLng) : undefined,
    },
    contact: { name: order.customerName, email: order.customerEmail },
    actions: availableActions(order, balanceDue),
  };
}

function isTerminal(status: OrderRow["status"]): boolean {
  return status === "fulfilled" || status === "cancelled" || status === "failed";
}

const isDelivery = (o: OrderRow) => o.fulfillment !== "pickup";

function fulfillmentSummary(order: OrderRow): string {
  if (order.fulfillment === "pickup") return "Pickup at the shop";
  if (order.fulfillment === "delivery_instant") return "Instant delivery";
  return "Scheduled delivery";
}

/**
 * Four steps, because four is what the data can actually support. The table
 * knows placed / paid / fulfilled — there is no "cooking" or "driver assigned"
 * signal anywhere, and inventing one would be a progress bar that lies.
 */
function buildSteps(order: OrderRow, pays: PaymentRow[]): TrackingStep[] {
  const paidAt = order.paidAt ?? undefined;
  const isPaid = order.status === "paid" || order.status === "fulfilled" || Boolean(paidAt);
  const failedPayment = pays.some((p) => p.status === "failed" || p.status === "rejected");
  const done = order.status === "fulfilled";
  const cancelled = order.status === "cancelled";

  const placed: TrackingStep = {
    key: "placed",
    label: "Order placed",
    state: "done",
    at: order.createdAt,
  };

  const payment: TrackingStep = {
    key: "payment",
    label: isPaid ? "Payment received" : "Awaiting payment",
    state: order.status === "failed" || failedPayment ? "failed" : isPaid ? "done" : "current",
    at: paidAt,
  };

  const preparing: TrackingStep = {
    key: "preparing",
    label: "Being prepared",
    state: cancelled ? "failed" : done ? "done" : isPaid ? "current" : "upcoming",
  };

  const handover: TrackingStep = {
    key: "handover",
    label: isDelivery(order) ? "Delivered" : "Ready for pickup",
    state: cancelled ? "failed" : done ? "done" : "upcoming",
    detail: cancelled ? "This order was cancelled." : undefined,
  };

  return [placed, payment, preparing, handover];
}

function availableActions(order: OrderRow, balanceDue: number): TrackingAction[] {
  if (isTerminal(order.status)) return [];
  const actions: TrackingAction[] = ["request_cancel", "add_note"];
  if (balanceDue > 0) actions.unshift("pay_balance");
  return actions;
}
