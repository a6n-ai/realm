// Leaf: imports nothing from db/schema, so tables can share these types without import cycles.
export const COUPON_KINDS = ["percentage", "fixed", "free_delivery", "first_order", "rep_daily", "rep_code"] as const;
type CouponKind = (typeof COUPON_KINDS)[number];

// Admin discount governance blob on app_settings (mirrors leadAssignment).
export interface DiscountPolicy {
  enabledKinds: CouponKind[];
  repDaily: {
    enabled: boolean;
    defaultCapPct: number;
    defaultCapAmount: number;
    // How many times a rep may apply their daily coupon to grant a discount that
    // day (snapshotted onto the minted coupon's maxRedemptions). 1 = single-use,
    // preserving the legacy behavior until an admin raises it.
    defaultDailyUses: number;
    // How long a code a staff member generates for a customer stays usable.
    codeValidityHours: number;
    perRep: Record<string, { capPct?: number; capAmount?: number; dailyUses?: number; active: boolean }>;
  };
}
