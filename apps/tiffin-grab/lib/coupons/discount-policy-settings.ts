import { couponKind } from "@/db/schema/coupons";
import type { DiscountPolicy } from "@/db/schema/types";
import { settingsCache, saveSetting } from "@/lib/settings";
import { db } from "@/db/client";
import { app } from "@/db/schema";

// Default discount governance: every kind honored, rep daily allowance OFF until
// an admin opts in and sets ceilings. Mirrors the leadAssignment default shape.
const DISCOUNT_POLICY_DEFAULT: DiscountPolicy = {
  enabledKinds: [...couponKind.enumValues],
  repDaily: { enabled: false, defaultCapPct: 0, defaultCapAmount: 0, defaultDailyUses: 1, codeValidityHours: 48, perRep: {} },
};

export async function getDiscountPolicy(): Promise<DiscountPolicy> {
  return settingsCache.getOrSet("discountPolicy", async () => {
    const [row] = await db.select({ dp: app.discountPolicy }).from(app).limit(1);
    const dp = (row?.dp as Partial<DiscountPolicy>) ?? {};
    return {
      enabledKinds: dp.enabledKinds ?? [...DISCOUNT_POLICY_DEFAULT.enabledKinds],
      repDaily: { ...DISCOUNT_POLICY_DEFAULT.repDaily, ...(dp.repDaily ?? {}) },
    };
  });
}

export async function setDiscountPolicy(policy: DiscountPolicy): Promise<void> {
  await saveSetting({ discountPolicy: policy });
}
