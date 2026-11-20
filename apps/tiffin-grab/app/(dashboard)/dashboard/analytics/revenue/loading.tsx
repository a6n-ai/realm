import { AnalyticsTabSkeleton } from "@/components/dashboard/analytics/skeletons";

export default function Loading() {
  return (
    <AnalyticsTabSkeleton
      description="Money kept after refunds, excluding tax and card surcharge, by payment date."
      statRows={2}
      rows={[
      [{ title: "Net revenue by day" }, { title: "Revenue calendar" }],
      [{ title: "How much is still owed?" }, { title: "Payments" }],
      [{ title: "Discounts given" }, { title: "Free tiffins" }],
      ]}
    />
  );
}
