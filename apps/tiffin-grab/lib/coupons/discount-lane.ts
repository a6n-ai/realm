import { round2 } from "@foundry/commons/util/money";
import { ValidationError } from "@foundry/commons";
import type { PricingLine } from "@/lib/pricing";
import { BELOW_COST_ERROR } from "@/lib/pricing/cost-floor";
import { couponsService, type BestCouponsResult } from "@/lib/coupons/coupons.service";
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
 *
 * When `costFloor` is set (meal cost × tiffin count), staff-applied coupons and the rep
 * discount are refused if they would leave the post-catalog total below that floor. Auto
 * coupons stay — those are admin catalog policy, not a sales-agent giveaway.
 */
export async function applyDiscountLane(args: {
  postCatalog: number;
  planType?: string;
  userId: bigint | null;
  paymentMethodId: string | null;
  manualCode?: string | null;
  manualCodes?: readonly string[] | null;
  rep?: RepDiscountInput;
  /** Kitchen COGS for the plan; null/omit skips the below-cost guard. */
  costFloor?: number | null;
  strict: boolean;
}): Promise<DiscountLaneResult> {
  const { postCatalog, strict, costFloor = null } = args;
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
  if (rep && (strict || rep.actorId != null)) {
    if (best.redemptions.some((r) => r.coupon.kind === "rep_code")) {
      if (strict) throw new ValidationError(ONE_STAFF_DISCOUNT);
      result.error = ONE_STAFF_DISCOUNT;
    } else if (rep.actorId == null) {
      throw new ValidationError("A rep discount requires an acting staff member");
    } else {
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
    }
  }

  return enforceCostFloor(result, postCatalog, costFloor, strict);
}

/** Drop staff-applied discounts that would sell the plan below kitchen cost. */
function enforceCostFloor(
  result: DiscountLaneResult,
  postCatalog: number,
  costFloor: number | null,
  strict: boolean,
): DiscountLaneResult {
  if (costFloor == null) return result;
  const total = () => result.lines.reduce((sum, a) => sum + a.amount, 0);
  if (round2(postCatalog - total()) >= costFloor) return result;

  const keep = result.applied.filter((a) => a.coupon.autoApply);
  const dropped = result.applied.filter((a) => !a.coupon.autoApply);
  const hadRep = result.rep != null;
  if (dropped.length === 0 && !hadRep) return result;

  const lines: PricingLine[] = keep.map((a) => ({ label: `${a.coupon.name} (${a.coupon.code})`, amount: a.amount }));
  const manualErrors: typeof result.best.manualErrors = [
    ...result.best.manualErrors,
    ...dropped.map((d) => ({ code: d.coupon.code, error: BELOW_COST_ERROR })),
  ];
  if (strict) {
    if (dropped[0]) throw new ValidationError(`${dropped[0].coupon.code}: ${BELOW_COST_ERROR}`);
    throw new ValidationError(BELOW_COST_ERROR);
  }
  return {
    best: {
      ...result.best,
      lines,
      redemptions: keep,
      manualError: manualErrors[0]?.error ?? result.best.manualError,
      manualErrorCode: manualErrors[0]?.errorCode,
      manualErrors,
    },
    lines,
    applied: keep,
    rep: null,
    error: hadRep ? BELOW_COST_ERROR : result.error,
  };
}
