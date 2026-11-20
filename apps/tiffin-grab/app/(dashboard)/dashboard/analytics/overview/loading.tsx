import { AnalyticsTabSkeleton } from "@/components/dashboard/analytics/skeletons";

export default function Loading() {
  return (
    <AnalyticsTabSkeleton
      description="Sales, profit, customers, and tickets for the selected range."
      statRows={2}
      rows={[
      [{ title: "Net revenue by day" }, { title: "Revenue mix" }],
      [{ title: "What share of trials became a plan?" }, { title: "Customer status" }],
      [{ title: "Day by day", height: 320 }],
      ]}
    />
  );
}
