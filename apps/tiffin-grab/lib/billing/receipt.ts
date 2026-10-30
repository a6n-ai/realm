import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, ledgerEntries, mealSizes, orders, payments, plans, users } from "@/db/schema";
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
  /** What was charged, card fee included. */
  amount: number;
  cardFee: number;
  /** Money returned on this payment (partial or full). */
  refunded: number;
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
  /** orders.total: paid mid-plan add-ons are already folded into it and into the lines. */
  orderTotal: number;
  payments: ReceiptPayment[];
  cardFees: number;
  paid: number;
  refunded: number;
  balanceDue: number;
};

const PAID: PayStatus[] = ["paid", "simulated_paid"];
// Money that came in at some point; a refund afterwards is shown separately, not as owed.
const RECEIVED: PayStatus[] = [...PAID, "refunded"];
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
      status: orders.status,
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
        id: payments.id,
      })
      .from(payments)
      .where(and(eq(payments.orderId, o.id)))
      .orderBy(asc(payments.createdAt)),
    getAppSettings(),
    getBrandOrganizationAddress(),
  ]);
  // Every refund (Stripe or staff, partial or full) is a ledger refund row; older staff refunds only flipped status (fallback below).
  const refundRows = await db
    .select({ paymentId: ledgerEntries.paymentId, amount: sql<string>`sum(${ledgerEntries.amount})` })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.orderId, o.id), eq(ledgerEntries.type, "refund")))
    .groupBy(ledgerEntries.paymentId);
  const ledgerRefund = new Map(refundRows.map((r) => [r.paymentId, Number(r.amount)]));

  // WordPress-imported orders carry a snapshot without price lines; show the plan as one line.
  const snap = o.snapshot as { lineItems?: unknown } | null;
  const order = snap?.lineItems
    ? payPageLines({ amount: o.total, addonRequest: null }, { pricingSnapshot: o.snapshot })
    : { lines: [{ label: `${o.mealSize} plan`, amount: Number(o.total) }], taxLines: [], total: Number(o.total) };

  const kept = pays.filter((p) => !SKIP.includes(p.status));
  const receiptPayments: ReceiptPayment[] = kept.map((p) => {
    const cardFee = p.method === "stripe" ? Number(p.surcharge) : 0;
    const amount = round(Number(p.amount) + cardFee);
    const refunded = ledgerRefund.get(p.id) ?? (p.status === "refunded" ? amount : 0);
    return {
      date: p.capturedAt ?? p.createdAt,
      method: paymentMethodLabel(p),
      reference: p.method === "stripe" ? p.providerRef : p.reference,
      amount,
      cardFee,
      refunded: round(refunded),
      status: PAID.includes(p.status) ? "paid" : p.status === "refunded" ? "refunded" : "pending",
    };
  });
  // WordPress imports have no payment row: they were paid on the old site.
  if (o.code.startsWith("wc-") && !kept.some((p) => RECEIVED.includes(p.status))) {
    receiptPayments.unshift({ date: o.createdAt, method: "Paid on our previous website", reference: null, amount: Number(o.total), cardFee: 0, refunded: 0, status: "paid" });
  }

  const sum = (xs: number[]) => round(xs.reduce((a, b) => a + b, 0));
  const received = receiptPayments.filter((p) => p.status !== "pending");
  const covered = sum(received.map((p) => p.amount - p.cardFee));

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
    payments: receiptPayments,
    cardFees: sum(received.map((p) => p.cardFee)),
    paid: sum(received.map((p) => p.amount)),
    refunded: sum(receiptPayments.map((p) => p.refunded)),
    // A cancelled order owes nothing, whatever was or wasn't paid.
    balanceDue: o.status === "cancelled" ? 0 : Math.max(0, round(order.total - covered)),
  };
}
