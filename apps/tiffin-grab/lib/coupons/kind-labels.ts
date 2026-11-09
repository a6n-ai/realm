import type { CouponKind } from "@/db/schema/coupons";

// Plain module (no "use client") so server components can import these values
// directly — pulled out of controls.tsx per the RSC value-import rule.
export const KIND_LABELS: Record<CouponKind, string> = {
  percentage: "Percentage off",
  fixed: "Fixed amount off",
  free_delivery: "Free delivery",
  first_order: "First order",
  rep_daily: "Rep daily",
  rep_code: "Staff code",
};
export const ALL_KINDS = Object.keys(KIND_LABELS) as CouponKind[];
// free_delivery always resolves to $0, so staff can no longer pick it; the enum value stays for old rows.
export const CREATABLE_KINDS = ALL_KINDS.filter((k) => k !== "rep_daily" && k !== "rep_code" && k !== "free_delivery");
// The Kinds policy page: every kind staff can switch on. free_delivery has nothing to switch.
export const POLICY_KINDS = ALL_KINDS.filter((k) => k !== "free_delivery");
