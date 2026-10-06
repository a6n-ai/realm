import { ValidationError } from "@foundry/commons";
import { resolveCoupons, type CouponCandidate, type IneligibleReason } from "@foundry/coupons";
import { computeTax, type PaymentMethodConfig } from "@foundry/payments";
import { capRedemption } from "@foundry/wallet";
import type { Adjustment, BookingPricing, DiscountScope, SessionCategory } from "@/db/schema";

export type DiscountRule = {
  publicId: string;
  name: string;
  scope: DiscountScope;
  category: SessionCategory | null;
  sessionId: bigint | null;
  percentOff: number | null;
  amountOff: number | null;
  minSubtotal: number | null;
  startsAt: number | null;
  endsAt: number | null;
  stackable: boolean;
  active: boolean;
};

export type CouponRule = {
  publicId: string;
  code: string;
  name: string;
  percentOff: number | null;
  amountOff: number | null;
  minSubtotal: number | null;
  maxRedemptions: number | null;
  maxPerUser: number | null;
  redemptionCount: number;
  userRedemptionCount: number;
  allowedPaymentMethods: string[];
  startsAt: number | null;
  expiresAt: number | null;
  stackable: boolean;
  active: boolean;
};

export type CodeError = IneligibleReason | "not_found" | "superseded";
export type BookingQuote = BookingPricing & { codeError: CodeError | null };

export type PriceBookingInput = {
  unitPrice: string | number;
  seats: number;
  session: { id: bigint; category: SessionCategory };
  method: PaymentMethodConfig | null;
  discounts: DiscountRule[];
  coupon: CouponRule | null;
  /** The family typed something into the code box. */
  codeTyped: boolean;
  maxDiscountPct: number;
  now: number;
  /** Family wallet to spend from, or null when not using coins. */
  coins: { balance: number; rate: number } | null;
};

export const CODE_ERROR_MESSAGE: Record<CodeError, string> = {
  not_found: "That code doesn't exist.",
  inactive: "That code is no longer active.",
  not_started: "That code isn't active yet.",
  expired: "That code has expired.",
  below_min_subtotal: "Your booking is below this code's minimum.",
  redemption_limit: "That code has been fully used.",
  user_limit: "You've already used this code.",
  payment_method: "That code doesn't work with this payment method.",
  superseded: "A better discount already applies.",
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function appliesToSession(
  rule: Pick<DiscountRule, "scope" | "category" | "sessionId">,
  session: { id: bigint; category: SessionCategory },
): boolean {
  if (rule.scope === "all") return true;
  if (rule.scope === "category") return rule.category === session.category;
  return rule.sessionId === session.id;
}

/** Trims from the last adjustment back, so earlier lines keep their full value. */
export function capAdjustments(adjustments: Adjustment[], subtotal: number, maxDiscountPct: number): Adjustment[] {
  const pct = Math.min(Math.max(maxDiscountPct, 0), 100);
  const cap = round2((subtotal * pct) / 100);
  let over = round2(adjustments.reduce((s, a) => s + a.amount, 0) - cap);
  if (over <= 0) return adjustments;
  const out = [...adjustments];
  for (let i = out.length - 1; i >= 0 && over > 0; i--) {
    const line = out[i]!;
    const cut = Math.min(line.amount, over);
    out[i] = { ...line, amount: round2(line.amount - cut) };
    over = round2(over - cut);
  }
  return out.filter((a) => a.amount > 0);
}

const DISCOUNT_PREFIX = "d:";
const COUPON_PREFIX = "c:";

export function priceBooking(input: PriceBookingInput): BookingQuote {
  const unit = Number(input.unitPrice);
  if (!Number.isFinite(unit) || unit < 0) throw new ValidationError("Class price is invalid.");
  const subtotal = round2(unit * input.seats);

  const candidates: CouponCandidate[] = input.discounts
    .filter((d) => appliesToSession(d, input.session))
    .map((d) => ({
      id: DISCOUNT_PREFIX + d.publicId,
      name: d.name,
      active: d.active,
      percentOff: d.percentOff,
      amountOff: d.amountOff,
      minSubtotal: d.minSubtotal,
      startsAt: d.startsAt,
      expiresAt: d.endsAt,
      stackable: d.stackable,
    }));
  const c = input.coupon;
  if (c) {
    candidates.push({
      id: COUPON_PREFIX + c.publicId,
      name: c.name,
      code: c.code,
      active: c.active,
      percentOff: c.percentOff,
      amountOff: c.amountOff,
      minSubtotal: c.minSubtotal,
      startsAt: c.startsAt,
      expiresAt: c.expiresAt,
      maxRedemptions: c.maxRedemptions,
      redemptionCount: c.redemptionCount,
      maxPerUser: c.maxPerUser,
      userRedemptionCount: c.userRedemptionCount,
      stackable: c.stackable,
      allowedPaymentMethods: c.allowedPaymentMethods,
    });
  }

  const resolved = resolveCoupons(candidates, { subtotal, now: input.now, paymentMethod: input.method?.id ?? null });
  const adjustments = capAdjustments(
    resolved.applied.map((a): Adjustment => ({
      kind: a.id.startsWith(COUPON_PREFIX) ? "coupon" : "discount",
      publicId: a.id.slice(2),
      name: a.name,
      amount: a.amount,
      ...(a.code ? { code: a.code } : {}),
    })),
    subtotal,
    input.maxDiscountPct,
  );

  // Coins are the family's own money, so the discount cap does not apply to them.
  if (input.coins && input.coins.balance > 0 && input.coins.rate > 0) {
    const remaining = round2(subtotal - adjustments.reduce((s, a) => s + a.amount, 0));
    if (remaining > 0) {
      const { coinsSpent, currencyValue } = capRedemption(input.coins.balance, input.coins.rate, remaining);
      if (coinsSpent > 0 && currencyValue > 0) {
        adjustments.push({ kind: "wallet", publicId: "wallet", name: "Wallet coins", amount: currencyValue, coins: coinsSpent });
      }
    }
  }

  const discountTotal = round2(adjustments.reduce((s, a) => s + a.amount, 0));
  const taxable = round2(subtotal - discountTotal);
  const taxTotal = input.method ? computeTax(taxable, input.method.taxes).taxTotal : 0;

  let codeError: CodeError | null = null;
  if (input.codeTyped) {
    if (!c) codeError = "not_found";
    else {
      const rejected = resolved.rejected.find((r) => r.id === COUPON_PREFIX + c.publicId);
      if (rejected) codeError = rejected.reason;
      else if (!adjustments.some((a) => a.kind === "coupon")) codeError = "superseded";
    }
  }

  return { subtotal, adjustments, discountTotal, taxTotal, total: round2(taxable + taxTotal), codeError };
}

export function toPricing({ codeError: _codeError, ...pricing }: BookingQuote): BookingPricing {
  return pricing;
}
