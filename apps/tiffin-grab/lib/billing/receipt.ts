import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, mealSizes, orders, payments, plans, users } from "@/db/schema";
import { payPageLines, type Line } from "@/app/(customer)/me/pay/[paymentId]/lines";
import { paymentMethodLabel } from "./payment-labels";
import { getBrandOrganizationAddress } from "@/lib/services/organizations.service";
import { getAppSettings } from "@/lib/services/app-settings.service";

type PayStatus = (typeof payments.status.enumValues)[number];

export type ReceiptPayment = {
  date: number;
  method: string;
  /** Stripe PaymentIntent id or the customer's e-Transfer reference. */
  reference: string | null;
  amount: number;
  cardFee: number;
  status: "paid" | "pending" | "refunded";
};

export type Receipt = {
  orderPublicId: string;
  code: string;
  orderedAt: number;
  issuedAt: number;
  currency: string;
  timezone: string;
  business: { name: string; address: string | null };
  customer: { name: string; email: string | null; address: string };
  plan: { title: string; startDate: string; lastDate: string | null; weeks: number; tiffins: number };
  lines: Line[];
  taxLines: Line[];
  orderTotal: number;
  /** Each paid mid-plan add-on, priced on its own. */
  addons: { date: number; lines: Line[]; taxLines: Line[]; total: number }[];
  payments: ReceiptPayment[];
  cardFees: number;
  paid: number;
  refunded: number;
  balanceDue: number;
};

const PAID: PayStatus[] = ["paid", "simulated_paid"];
// Not money received or owed yet: an unpaid card link, a rejected claim.
const SKIP: PayStatus[] = ["awaiting_payment", "rejected"];

const round = (n: number) => Math.round(n * 100) / 100;

/** The order's receipt, or null when it doesn't exist. Callers do the access check. */
export async function loadReceipt(orderPublicId: string, now = Date.now()): Promise<Receipt | null> {
  const [o] = await db
    .select({
      id: orders.id,
      publicId: orders.publicId,
      code: orders.deploymentId,
      createdAt: orders.createdAt,
      total: orders.total,
      snapshot: orders.pricingSnapshot,
      startDate: orders.startDate,
      weeks: orders.durationWeeks,
      tiffins: orders.tiffinCount,
      fullName: orders.fullName,
      addressLine: orders.addressLine,
      addressUnit: orders.addressUnit,
      city: orders.city,
      postalCode: orders.postalCode,
      email: users.email,
      mealSize: mealSizes.name,
      plan: plans.name,
    })
    .from(orders)
    .innerJoin(mealSizes, eq(mealSizes.id, orders.mealSizeId))
    .innerJoin(plans, eq(plans.id, orders.planId))
    .leftJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.publicId, orderPublicId))
    .limit(1);
  if (!o) return null;

  const [[last], pays, { currency, timezone }, address] = await Promise.all([
    db.select({ d: sql<string | null>`max(${deliveries.deliveryDate})` }).from(deliveries).where(eq(deliveries.orderId, o.id)),
    db
      .select({
        status: payments.status,
        method: payments.method,
        amount: payments.amount,
        surcharge: payments.surchargeAmount,
        cardBrand: payments.cardBrand,
        cardLast4: payments.cardLast4,
        providerRef: payments.providerRef,
        reference: payments.reference,
        capturedAt: payments.capturedAt,
        createdAt: payments.createdAt,
        addonRequest: payments.addonRequest,
      })
      .from(payments)
      .where(and(eq(payments.orderId, o.id)))
      .orderBy(asc(payments.createdAt)),
    getAppSettings(),
    getBrandOrganizationAddress(),
  ]);

  // WordPress-imported orders carry a snapshot without price lines; show the plan as one line.
  const snap = o.snapshot as { lineItems?: unknown } | null;
  const order = snap?.lineItems
    ? payPageLines({ amount: o.total, addonRequest: null }, { pricingSnapshot: o.snapshot })
    : { lines: [{ label: `${o.mealSize} plan`, amount: Number(o.total) }], taxLines: [], total: Number(o.total) };

  const kept = pays.filter((p) => !SKIP.includes(p.status));
  const receiptPayments: ReceiptPayment[] = kept.map((p) => ({
    date: p.capturedAt ?? p.createdAt,
    method: paymentMethodLabel(p),
    reference: p.method === "stripe" ? p.providerRef : p.reference,
    amount: Number(p.amount),
    cardFee: p.method === "stripe" ? Number(p.surcharge) : 0,
    status: PAID.includes(p.status) ? "paid" : p.status === "refunded" ? "refunded" : "pending",
  }));
  const addons = kept
    .filter((p) => p.addonRequest && PAID.includes(p.status))
    .map((p) => {
      const l = payPageLines(p, { pricingSnapshot: null });
      return { date: p.capturedAt ?? p.createdAt, lines: l.lines, taxLines: l.taxLines, total: l.total };
    });

  const sum = (xs: number[]) => round(xs.reduce((a, b) => a + b, 0));
  const paidRows = receiptPayments.filter((p) => p.status === "paid");
  const paidForOrder = sum(kept.filter((p) => !p.addonRequest && PAID.includes(p.status)).map((p) => Number(p.amount)));

  return {
    orderPublicId: o.publicId,
    code: o.code,
    orderedAt: o.createdAt,
    issuedAt: now,
    currency,
    timezone,
    business: { name: "TiffinGrab", address },
    customer: {
      name: o.fullName,
      email: o.email,
      address: [o.addressUnit ? `${o.addressUnit} - ${o.addressLine}` : o.addressLine, o.city, o.postalCode].filter(Boolean).join(", "),
    },
    plan: { title: `${o.mealSize} · ${o.plan}`, startDate: o.startDate, lastDate: last?.d ?? null, weeks: o.weeks, tiffins: o.tiffins },
    lines: order.lines,
    taxLines: order.taxLines,
    orderTotal: order.total,
    addons,
    payments: receiptPayments,
    cardFees: sum(paidRows.map((p) => p.cardFee)),
    paid: sum(paidRows.map((p) => p.amount + p.cardFee)),
    refunded: sum(receiptPayments.filter((p) => p.status === "refunded").map((p) => p.amount)),
    balanceDue: Math.max(0, round(order.total - paidForOrder)),
  };
}
