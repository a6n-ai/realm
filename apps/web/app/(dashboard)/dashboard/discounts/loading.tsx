import { SkeletonFormCard } from "@/components/ds";

// Fills the content slot below the discounts sub-tabs (which the discounts
// layout keeps painting). Sub-pages are heterogeneous (coupons table, kinds /
// rep-allowance forms); a single card placeholder covers them generically.
export default function Loading() {
  return <SkeletonFormCard fields={3} />;
}
