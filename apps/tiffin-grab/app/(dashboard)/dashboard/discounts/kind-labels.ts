import type { CouponKind } from "@/db/schema/coupons";

// Plain module (no "use client") so server components can import these values
// directly — pulled out of controls.tsx per the RSC value-import rule.
export const KIND_LABELS: Record<CouponKind, string> = {
  percentage: "Percentage off",
  fixed: "Fixed amount off",
  free_delivery: "Free delivery",
  first_order: "First order",
  rep_daily: "Rep daily",
};
export const ALL_KINDS = Object.keys(KIND_LABELS) as CouponKind[];
export const CREATABLE_KINDS = ALL_KINDS.filter((k) => k !== "rep_daily");
