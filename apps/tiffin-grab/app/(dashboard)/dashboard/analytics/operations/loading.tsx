import { AnalyticsTabSkeleton } from "@/components/dashboard/analytics/skeletons";

export default function Loading() {
  return (
    <AnalyticsTabSkeleton
      description="Deliveries by status, and how many stops each driver is carrying."
      statRows={1}
      rows={[
      [{ title: "Deliveries calendar" }, { title: "Route load per driver" }],
      [{ title: "What share of deliveries was skipped?" }, { title: "Delivery status" }],
      ]}
    />
  );
}
