import { and, eq, inArray } from "drizzle-orm";
import { formatMoney, NotFoundError, ValidationError } from "@foundry/commons";
import { findMethod } from "@foundry/payments";
import { db } from "@/db/client";
import { deliveries, mealSizes, orderActivities, orderAddons, orders, payments, type PaymentProof } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { countsWithAddons, orderAddonValues } from "@/lib/menu/order-addon-items";
import { PAYMENT_REVIEW_STATUSES } from "@/lib/orders/display-status";
import { resolveAddonSelections, type ResolvedAddon } from "@/lib/pricing/build-catalog";
import { addAddonsToSnapshot, type MidPlanAddonPricing } from "@/lib/pricing/mid-plan-addons";
import type { OrderPricingSnapshot } from "@/lib/pricing/types";
import { publishAnalyticsLive } from "@/lib/realtime/publish-inbox";
import { resolveCheckoutTaxes } from "@/lib/tax/checkout-taxes";
import { getPaymentConfig } from "./app-settings.service";
import { ledgerService } from "./ledger.service";
import { openTiffinCount } from "./tiffin-counts";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PaymentMethodValue = (typeof payments.method.enumValues)[number];

export type AddonSelection = { key: string; qty: number };

export type AddonQuote = {
  openTiffins: number;
  lines: { label: string; amount: number }[];
  addonSubtotal: number;
  taxTotal: number;
  amountDue: number;
  newTotal: number;
};

type Priced = {
  order: typeof orders.$inferSelect;
  addons: ResolvedAddon[];
  openTiffins: number;
  method: { id: PaymentMethodValue; requireProof: boolean };
  pricing: MidPlanAddonPricing;
};

const toQuote = (p: Priced): AddonQuote => ({
  openTiffins: p.openTiffins,
  lines: p.pricing.lines,
  addonSubtotal: p.pricing.addonSubtotal,
  taxTotal: p.pricing.taxTotal,
  amountDue: p.pricing.amountDue,
  newTotal: p.pricing.snapshot.total,
});

// Every rule and every number for a mid-plan add-on, shared by the quote and the save so the
// amount staff are shown is the amount that is written. `lock` takes the order row for the
// save's transaction: two staff saving at once then price one after the other.
async function priceAddons(
  reader: Pick<Tx, "select">,
  orderPublicId: string,
  selections: AddonSelection[],
  methodId: string,
  lock: boolean,
): Promise<Priced> {
  const base = reader.select().from(orders).where(eq(orders.publicId, orderPublicId));
  const [order] = lock ? await base.for("update").limit(1) : await base.limit(1);
  if (!order) throw new NotFoundError(`Order not found: ${orderPublicId}`);

  if (order.status !== "active" && order.status !== "paused") {
    throw new ValidationError(`Add-ons can only be added to a running plan (this one is ${order.status})`);
  }
  if (order.trialLength != null) throw new ValidationError("A trial can't take add-ons");
  const [mealSize] = await reader.select({ custom: mealSizes.custom }).from(mealSizes).where(eq(mealSizes.id, order.mealSizeId)).limit(1);
  if (mealSize?.custom) throw new ValidationError("A custom meal can't take add-ons; edit the custom meal instead");
  const snapshot = order.pricingSnapshot as OrderPricingSnapshot | null;
  if (!snapshot) throw new ValidationError("This order has no pricing receipt to add to");

  if (selections.length === 0) throw new ValidationError("Pick at least one add-on");
  if (new Set(selections.map((s) => s.key)).size !== selections.length) {
    throw new ValidationError("Each add-on can only be listed once");
  }

  const open = await reader.select({ id: payments.id }).from(payments)
    .where(and(eq(payments.orderId, order.id), inArray(payments.status, [...PAYMENT_REVIEW_STATUSES]))).limit(1);
  if (open.length) throw new ValidationError("A payment is still pending on this plan. Confirm it first.");

  const cfg = await getPaymentConfig();
  const method = findMethod(cfg, methodId);
  if (!method?.enabled || method.id === "simulated" || !(payments.method.enumValues as readonly string[]).includes(method.id)) {
    throw new ValidationError("Choose the payment method the customer used");
  }

  const addons = resolveAddonSelections(await loadCatalogSnapshot(order.organizationId), selections);
  const existing = await reader.select({ key: orderAddons.addonKey, qty: orderAddons.qty }).from(orderAddons).where(eq(orderAddons.orderId, order.id));
  for (const a of addons) {
    const have = existing.filter((e) => e.key === a.key).reduce((s, e) => s + e.qty, 0);
    if (have + a.qty > a.maxQty) {
      throw new ValidationError(`${a.name}: at most ${a.maxQty} per tiffin, this plan already has ${have}`);
    }
  }

  const rows = await reader
    .select({ status: deliveries.status, cutoffAt: deliveries.cutoffAt, tiffinUnits: deliveries.tiffinUnits, complimentaryNote: deliveries.complimentaryNote, mergedIntoDeliveryId: deliveries.mergedIntoDeliveryId })
    .from(deliveries)
    .where(eq(deliveries.orderId, order.id));
  const openTiffins = openTiffinCount(order.tiffinCount, rows, Date.now());
  if (openTiffins < 1) throw new ValidationError("This plan has no tiffins left to add add-ons to");

  // Destination-based tax, the same helper checkout uses, plus the chosen method's own taxes.
  const { taxes } = await resolveCheckoutTaxes({ postalCode: order.postalCode, methodTaxes: method.taxes });

  return {
    order,
    addons,
    openTiffins,
    method: { id: method.id as PaymentMethodValue, requireProof: method.requireProof === true },
    pricing: addAddonsToSnapshot(snapshot, addons, openTiffins, taxes),
  };
}

/** What adding these add-ons would cost right now. No writes. Callers MUST requireStaff first. */
export async function quoteOrderAddons(orderPublicId: string, selections: AddonSelection[], methodId: string): Promise<AddonQuote> {
  return toQuote(await priceAddons(db, orderPublicId, selections, methodId, false));
}

/**
 * Staff add add-ons to a running plan and record the money they already hold for them.
 * The payment is written as paid, never awaiting: an open payment on an order holds kitchen
 * and dispatch (lib/orders/fulfillment.ts) and locks the customer's calendar, and
 * verifyPayment would re-queue the plan's past deliveries. Callers MUST requireStaff first.
 */
export async function addOrderAddons(
  orderPublicId: string,
  input: { selections: AddonSelection[]; methodId: string; proof?: PaymentProof | null; reference?: string | null },
  actorId: bigint | null,
): Promise<AddonQuote> {
  const quote = await db.transaction(async (tx) => {
    const p = await priceAddons(tx, orderPublicId, input.selections, input.methodId, true);
    const { order, pricing } = p;
    if (!order.userId) throw new ValidationError("This order has no customer to bill");
    const proof = input.proof ?? null;
    const reference = input.reference?.trim() || null;
    if (pricing.amountDue > 0 && p.method.requireProof && !proof) {
      throw new ValidationError("Attach the payment screenshot");
    }

    await tx.update(orders).set({
      total: pricing.snapshot.total.toFixed(2),
      pricingSnapshot: pricing.snapshot,
      categoryCounts: countsWithAddons((order.categoryCounts ?? {}) as Record<string, number>, p.addons),
      updatedBy: actorId,
    }).where(eq(orders.id, order.id));

    await tx.insert(orderAddons).values(orderAddonValues(order.id, p.addons, p.openTiffins, order.organizationId));

    const summary = p.addons.map((a) => (a.qty > 1 ? `${a.name} ×${a.qty}` : a.name)).join(", ");
    await tx.insert(orderActivities).values({
      orderId: order.id,
      type: "note",
      note: `Add-ons added for the remaining ${p.openTiffins} tiffins: ${summary} (${formatMoney(pricing.amountDue)})`,
      createdBy: actorId,
      organizationId: order.organizationId,
    });

    if (pricing.amountDue > 0) {
      const now = Date.now();
      const [pay] = await tx.insert(payments).values({
        orderId: order.id,
        status: "paid",
        method: p.method.id,
        amount: pricing.amountDue.toFixed(2),
        capturedAt: now,
        claimedAt: now,
        reference,
        proof,
        note: `Add-ons: ${summary}`,
        createdBy: actorId,
        organizationId: order.organizationId,
      }).returning({ id: payments.id });
      await ledgerService.record(tx, {
        userId: order.userId,
        orderId: order.id,
        paymentId: pay.id,
        direction: "credit",
        type: "payment",
        amount: pricing.amountDue,
      });
      await tx.insert(orderActivities).values({
        orderId: order.id,
        type: "payment_verified",
        note: `${p.method.id} · ${pricing.amountDue.toFixed(2)}`,
        createdBy: actorId,
        organizationId: order.organizationId,
      });
    }

    return toQuote(p);
  });
  publishAnalyticsLive();
  return quote;
}
