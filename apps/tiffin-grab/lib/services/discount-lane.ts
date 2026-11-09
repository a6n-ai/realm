import { round2 } from "@foundry/commons/util/money";
import { ValidationError } from "@foundry/commons";
import type { PricingLine } from "@/lib/pricing";
import { couponsService, type BestCouponsResult } from "@/lib/services/coupons.service";
import type { coupons } from "@/db/schema";

type Coupon = typeof coupons.$inferSelect;

export type RepDiscountInput = { code: string; requestedAmount: number; actorId: bigint | null };

export type DiscountLaneResult = {
  best: BestCouponsResult;
  lines: PricingLine[];
  applied: { coupon: Coupon; amount: number }[];
  rep: PricingLine | null;
  error?: string;
};

const ONE_STAFF_DISCOUNT = "Only one staff discount per order: remove the staff code or the rep discount";

/**
 * Coupons then the rep discount, resolved against the post-catalog subtotal: the one lane
 * createOrder (strict: rejects) and the staff price preview (lenient: reports) both price through.
 * Coins come after, sized with coinLimits.
 */
export async function applyDiscountLane(args: {
  postCatalog: number;
  planType?: string;
  userId: bigint | null;
  paymentMethodId: string | null;
  manualCode?: string | null;
  manualCodes?: readonly string[] | null;
  rep?: RepDiscountInput;
  strict: boolean;
}): Promise<DiscountLaneResult> {
  const { postCatalog, strict } = args;
  const best = await couponsService.resolveBestCoupons({
    subtotal: postCatalog,
    planType: args.planType,
    userId: args.userId,
    paymentMethodId: args.paymentMethodId,
    manualCode: args.manualCode,
    manualCodes: args.manualCodes,
  });
  if (strict && best.manualErrors[0]) throw new ValidationError(`${best.manualErrors[0].code}: ${best.manualErrors[0].error}`);

  const lines: PricingLine[] = [];
  const applied: DiscountLaneResult["applied"] = [];
  const remaining = () => Math.max(0, round2(postCatalog - lines.reduce((sum, a) => sum + a.amount, 0)));
  for (const r of best.redemptions) {
    const amount = Math.min(r.amount, remaining());
    if (amount <= 0) continue;
    lines.push({ label: `${r.coupon.name} (${r.coupon.code})`, amount });
    applied.push({ coupon: r.coupon, amount });
  }

  const result: DiscountLaneResult = { best, lines, applied, rep: null };
  const { rep } = args;
  if (!rep || (!strict && rep.actorId == null)) return result;

  if (best.redemptions.some((r) => r.coupon.kind === "rep_code")) {
    if (strict) throw new ValidationError(ONE_STAFF_DISCOUNT);
    result.error = ONE_STAFF_DISCOUNT;
    return result;
  }
  if (rep.actorId == null) throw new ValidationError("A rep discount requires an acting staff member");
  try {
    const line = await couponsService.validateRepCoupon(rep.code, {
      subtotal: remaining(),
      requestedAmount: rep.requestedAmount,
      actorId: rep.actorId,
      planType: args.planType,
      userId: args.userId,
    });
    if (line.amount > 0) {
      lines.push(line);
      result.rep = line;
    }
  } catch (e) {
    if (strict) throw e;
  }
  return result;
}
