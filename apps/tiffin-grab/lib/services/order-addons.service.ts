import { eq } from "drizzle-orm";
import { formatMoney, NotFoundError, ValidationError } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { findMethod } from "@foundry/payments";
import { db } from "@/db/client";
import { deliveries, mealSizes, orderActivities, orderAddons, orders, payments, users, type AddonRequest, type PaymentProof } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { countsWithAddons, orderAddonValues } from "@/lib/menu/order-addon-items";
import { canTakeAddonPayment } from "@/lib/orders/display-status";
import { nextCutoffMs } from "@/lib/orders/paid-start";
import { fromCents, toCents } from "@/lib/payments/stripe";
import { resolveAddonSelections, type ResolvedAddon } from "@/lib/pricing/build-catalog";
import { addAddonsToSnapshot, round2, type MidPlanAddonPricing } from "@/lib/pricing/mid-plan-addons";
import type { OrderPricingSnapshot } from "@/lib/pricing/types";
import { publishAnalyticsLive, publishUserRefresh } from "@/lib/realtime/publish-inbox";
import { resolveCheckoutTaxes, stripeTaxFor } from "@/lib/tax/checkout-taxes";
import { getAppSettings, getPaymentConfig } from "./app-settings.service";
import { ledgerService } from "./ledger.service";
import { refundStripePayment } from "./payment-stripe";
import { openTiffinCount } from "./tiffin-counts";

const log = createLogger("order-addons.service");

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PaymentMethodValue = (typeof payments.method.enumValues)[number];
type Order = typeof orders.$inferSelect;
type TaxRate = { name: string; ratePct: number };

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
  order: Order;
  addons: ResolvedAddon[];
  openTiffins: number;
  method: { id: PaymentMethodValue; requireProof: boolean };
  pricing: MidPlanAddonPricing;
  tax: { source: "stripe" | "fallback"; calculationId: string | null; taxes: TaxRate[] };
};

// What the order column will hold once these add-ons are in: grown from the column, not reset
// to the receipt's own running total.
const newOrderTotal = (p: Pick<Priced, "order" | "pricing">): number => round2(Number(p.order.total) + p.pricing.amountDue);

const summaryOf = (addons: ResolvedAddon[]) => addons.map((a) => (a.qty > 1 ? `${a.name} ×${a.qty}` : a.name)).join(", ");

const toQuote = (p: Priced): AddonQuote => ({
  openTiffins: p.openTiffins,
  lines: p.pricing.lines,
  addonSubtotal: p.pricing.addonSubtotal,
  taxTotal: p.pricing.taxTotal,
  amountDue: p.pricing.amountDue,
  newTotal: newOrderTotal(p),
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

  if (!order.userId) throw new ValidationError("This order has no customer to bill");
  const paymentRows = await reader
    .select({ status: payments.status, addonRequest: payments.addonRequest, expiresAt: payments.expiresAt })
    .from(payments)
    .where(eq(payments.orderId, order.id));
  const blocker = canTakeAddonPayment(order, paymentRows);
  if (blocker) throw new ValidationError(blocker);

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

  // Same rule as checkout (priceWithTax): Stripe Tax on the add-on amount when it is on,
  // else destination rates plus the chosen method's own taxes.
  const fallback = await resolveCheckoutTaxes({ postalCode: order.postalCode, methodTaxes: method.taxes });
  const preTax = addAddonsToSnapshot(snapshot, addons, openTiffins, []);
  const quote = await stripeTaxFor(
    {
      taxableCents: toCents(preTax.addonSubtotal),
      reference: `addons:${order.publicId}`,
      address: { line1: order.addressLine ?? "", city: order.city, postalCode: order.postalCode ?? "", province: fallback.province },
    },
    { cache: !lock },
  );
  const tax: Priced["tax"] = quote
    ? { source: "stripe", calculationId: quote.calculationId, taxes: quote.lines.map((l) => ({ name: l.label, ratePct: l.ratePct })) }
    : { source: "fallback", calculationId: null, taxes: fallback.taxes };

  return {
    order,
    addons,
    openTiffins,
    method: { id: method.id as PaymentMethodValue, requireProof: method.requireProof === true },
    pricing: addAddonsToSnapshot(snapshot, addons, openTiffins, tax.taxes),
    tax,
  };
}

// Writes the add-ons onto the plan: order total/receipt/counts, the add-on rows, and the note.
async function applyAddons(tx: Tx, order: Order, addons: ResolvedAddon[], openTiffins: number, pricing: MidPlanAddonPricing, actorId: bigint | null) {
  await tx.update(orders).set({
    total: newOrderTotal({ order, pricing }).toFixed(2),
    pricingSnapshot: pricing.snapshot,
    categoryCounts: countsWithAddons((order.categoryCounts ?? {}) as Record<string, number>, addons),
    updatedBy: actorId,
  }).where(eq(orders.id, order.id));

  await tx.insert(orderAddons).values(orderAddonValues(order.id, addons, openTiffins, order.organizationId).map((v) => ({ ...v, createdBy: actorId })));

  await tx.insert(orderActivities).values({
    orderId: order.id,
    type: "note",
    note: `Add-ons added for the remaining ${openTiffins} tiffins: ${summaryOf(addons)} (${formatMoney(pricing.amountDue)})`,
    createdBy: actorId,
    organizationId: order.organizationId,
  });
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
 *
 * Stripe is the exception: nothing is applied yet. One awaiting add-on payment carries the
 * priced request until the next cutoff; settleAddonPayment applies it when the card is charged.
 */
export async function addOrderAddons(
  orderPublicId: string,
  input: { selections: AddonSelection[]; methodId: string; expectedAmountDue: number; proof?: PaymentProof | null; reference?: string | null },
  actorId: bigint | null,
): Promise<AddonQuote & { paymentPublicId?: string }> {
  const { quote, userPublicId } = await db.transaction(async (tx): Promise<{ quote: AddonQuote & { paymentPublicId?: string }; userPublicId: string | null }> => {
    const p = await priceAddons(tx, orderPublicId, input.selections, input.methodId, true);
    const { order, pricing } = p;
    const userId = order.userId!;
    const [customer] = await tx.select({ publicId: users.publicId }).from(users).where(eq(users.id, userId)).limit(1);
    // A check only: the amount written below is always the server's. Cutoffs and prices move
    // between the quote on screen and Save, and the screenshot matches what staff saw.
    if (pricing.amountDue.toFixed(2) !== input.expectedAmountDue.toFixed(2)) {
      throw new ValidationError(`The amount changed to ${formatMoney(pricing.amountDue)}. Check with the customer and try again.`);
    }
    const summary = summaryOf(p.addons);

    if (p.method.id === "stripe" && pricing.amountDue > 0) {
      const { timezone, cutoffHour } = await getAppSettings();
      const now = Date.now();
      const addonRequest: AddonRequest = {
        selections: p.addons.map((a) => ({ key: a.key, qty: a.qty, pricePerTiffin: a.pricePerTiffin })),
        taxes: p.tax.taxes,
        openTiffins: p.openTiffins,
        lines: pricing.lines,
        addonSubtotal: pricing.addonSubtotal,
        taxTotal: pricing.taxTotal,
        amountDue: pricing.amountDue,
        quotedAt: now,
      };
      const [pay] = await tx.insert(payments).values({
        orderId: order.id,
        status: "awaiting_payment",
        method: "stripe",
        amount: pricing.amountDue.toFixed(2),
        addonRequest,
        expiresAt: nextCutoffMs(now, cutoffHour, timezone),
        note: `Add-ons: ${summary}`,
        taxSource: p.tax.source,
        taxCalculationId: p.tax.calculationId,
        createdBy: actorId,
        organizationId: order.organizationId,
      }).returning({ publicId: payments.publicId });
      await tx.insert(orderActivities).values({
        orderId: order.id,
        type: "note",
        note: "Add-on payment link created",
        createdBy: actorId,
        organizationId: order.organizationId,
      });
      return { quote: { ...toQuote(p), paymentPublicId: pay!.publicId }, userPublicId: customer?.publicId ?? null };
    }

    const proof = input.proof ?? null;
    const reference = input.reference?.trim() || null;
    if (pricing.amountDue > 0 && p.method.requireProof && !proof) {
      throw new ValidationError("Attach the payment screenshot");
    }

    await applyAddons(tx, order, p.addons, p.openTiffins, pricing, actorId);

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
        userId,
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

    return { quote: toQuote(p), userPublicId: customer?.publicId ?? null };
  });
  // The save is committed: nothing below may throw, or staff would retry and pay twice.
  try {
    publishAnalyticsLive();
    if (userPublicId) publishUserRefresh(userPublicId);
  } catch (e) {
    log.error({ err: e }, "add-on live refresh failed");
  }
  return quote;
}

const SETTLEABLE = ["awaiting_payment", "pending_verification", "rejected"];

/**
 * Stripe confirmed an add-on payment: mark it paid and apply its request to the tiffins open now,
 * in one transaction. Fewer open than quoted (paused/held before paying) applies to those and
 * refunds the rest to the card after commit. A plan that is no longer running keeps the money
 * recorded and is flagged for a staff refund. Idempotent: a replay finds the row paid.
 */
export async function settleAddonPayment(
  paymentPublicId: string,
  opts: { providerEventId: string | null },
): Promise<"applied" | "not_applied" | "already_paid"> {
  const res = await db.transaction(async (tx) => {
    const [pay] = await tx.select().from(payments).where(eq(payments.publicId, paymentPublicId)).for("update").limit(1);
    if (!pay?.addonRequest) throw new NotFoundError(`Add-on payment not found: ${paymentPublicId}`);
    if (!SETTLEABLE.includes(pay.status)) return { outcome: "already_paid" as const };
    const req = pay.addonRequest;
    const [order] = await tx.select().from(orders).where(eq(orders.id, pay.orderId)).for("update").limit(1);
    if (!order?.userId) throw new NotFoundError("Order not found");
    const now = Date.now();
    const surcharge = Number(pay.surchargeAmount ?? 0);

    await tx.update(payments).set({ status: "paid", capturedAt: now }).where(eq(payments.id, pay.id));
    await ledgerService.record(tx, {
      userId: order.userId,
      orderId: order.id,
      paymentId: pay.id,
      direction: "credit",
      type: "payment",
      amount: (Number(pay.amount) + surcharge).toFixed(2),
      memo: surcharge > 0 ? `incl. card surcharge ${pay.surchargeAmount}` : null,
      providerEventId: opts.providerEventId,
    });
    await tx.insert(orderActivities).values({ orderId: order.id, type: "payment_verified", note: `stripe · ${pay.amount}`, organizationId: order.organizationId });

    const notApplied = async (why: string) => {
      await tx.insert(orderActivities).values({
        orderId: order.id,
        type: "note",
        note: `Add-ons paid but not applied (${why}) — refund needed`,
        organizationId: order.organizationId,
      });
      log.error({ paymentId: pay.publicId, why }, "stripe add-on paid but not applied");
      return { outcome: "not_applied" as const };
    };
    if (order.status !== "active" && order.status !== "paused") return notApplied(`order ${order.status}`);
    const snapshot = order.pricingSnapshot as OrderPricingSnapshot | null;
    if (!snapshot) return notApplied("no pricing receipt");

    let addons: ResolvedAddon[];
    try {
      const resolved = resolveAddonSelections(await loadCatalogSnapshot(order.organizationId), req.selections.map(({ key, qty }) => ({ key, qty })));
      // The customer paid the quoted price, not whatever the catalog says now.
      addons = resolved.map((a) => ({ ...a, pricePerTiffin: req.selections.find((s) => s.key === a.key)!.pricePerTiffin }));
    } catch (e) {
      if (e instanceof ValidationError) return notApplied(e.message);
      throw e;
    }

    const rows = await tx
      .select({ status: deliveries.status, cutoffAt: deliveries.cutoffAt, tiffinUnits: deliveries.tiffinUnits, complimentaryNote: deliveries.complimentaryNote, mergedIntoDeliveryId: deliveries.mergedIntoDeliveryId })
      .from(deliveries)
      .where(eq(deliveries.orderId, order.id));
    const open = Math.min(openTiffinCount(order.tiffinCount, rows, now), req.openTiffins);
    if (open < 1) return notApplied("no tiffins left");

    await applyAddons(tx, order, addons, open, addAddonsToSnapshot(snapshot, addons, open, req.taxes), null);

    // Per-tiffin share of what was charged (tax included), never more than the add-on amount.
    const refundCents = open < req.openTiffins
      ? Math.min(Math.round(((req.openTiffins - open) * toCents(req.amountDue)) / req.openTiffins), toCents(pay.amount))
      : 0;
    if (refundCents > 0) {
      await tx.insert(orderActivities).values({
        orderId: order.id,
        type: "note",
        note: `Add-ons applied to ${open} of the ${req.openTiffins} tiffins quoted; refunding ${fromCents(refundCents)} to the card`,
        organizationId: order.organizationId,
      });
    }
    const [customer] = await tx.select({ publicId: users.publicId }).from(users).where(eq(users.id, order.userId)).limit(1);
    return { outcome: "applied" as const, orderId: order.id, organizationId: order.organizationId, refundCents, userPublicId: customer?.publicId ?? null };
  });
  if (res.outcome !== "applied") return res.outcome;

  // After commit: Stripe is never called while the settle transaction holds its locks.
  if (res.refundCents > 0) {
    try {
      await refundStripePayment(paymentPublicId, fromCents(res.refundCents), "Fewer tiffins left than quoted", null);
    } catch (e) {
      log.error({ paymentId: paymentPublicId, err: e }, "automatic add-on refund failed");
      await db.insert(orderActivities).values({
        orderId: res.orderId,
        type: "note",
        note: `Automatic refund of ${fromCents(res.refundCents)} failed — refund it in Stripe`,
        organizationId: res.organizationId,
      }).catch((err) => log.error({ err }, "could not record failed refund"));
    }
  }
  try {
    publishAnalyticsLive();
    if (res.userPublicId) publishUserRefresh(res.userPublicId);
  } catch (e) {
    log.error({ err: e }, "add-on live refresh failed");
  }
  return "applied";
}
