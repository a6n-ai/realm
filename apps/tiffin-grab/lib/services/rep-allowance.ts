import type { DiscountPolicy } from "@/db/schema/coupons";

// Staff operate in IST; the daily rep allowance is anchored to the IST calendar day.
export const REP_ALLOWANCE_TZ = "Asia/Kolkata";

export interface RepAllowance {
  capPct: number;
  capAmount: number;
  dailyUses: number;
  codeValidityHours: number;
}

// A staff member's effective allowance (their override, else the default), or null when the
// allowance is off or switched off for them.
export function repAllowanceFor(policy: DiscountPolicy, staffPublicId: string): RepAllowance | null {
  const override = policy.repDaily.perRep[staffPublicId];
  if (!policy.repDaily.enabled || override?.active === false) return null;
  return {
    capPct: override?.capPct ?? policy.repDaily.defaultCapPct,
    capAmount: override?.capAmount ?? policy.repDaily.defaultCapAmount,
    dailyUses: override?.dailyUses ?? policy.repDaily.defaultDailyUses,
    codeValidityHours: policy.repDaily.codeValidityHours,
  };
}
