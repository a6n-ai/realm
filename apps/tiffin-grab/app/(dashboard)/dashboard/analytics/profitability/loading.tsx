import { AnalyticsTabSkeleton } from "@/components/dashboard/analytics/skeletons";

export default function Loading() {
  return (
    <AnalyticsTabSkeleton
      description="Earned revenue minus variable and allocated costs under your assumptions."
      statRows={1}
      rows={[
      [{ title: "Day by day", height: 320 }],
      [{ title: "Profit by day" }, { title: "Where the money goes" }],
      [{ title: "Orders by week", height: 320 }],
      ]}
    />
  );
}
