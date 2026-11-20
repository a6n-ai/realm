import { AnalyticsTabSkeleton } from "@/components/dashboard/analytics/skeletons";

export default function Loading() {
  return (
    <AnalyticsTabSkeleton
      description="What each rep worked, converted, and closed."
      statRows={1}
      rows={[
      [{ title: "Reps ranked by revenue" }],
      [{ title: "Revenue by rep" }, { title: "Workload mix" }],
      [{ title: "Leads worked per rep" }, { title: "Tickets resolved per rep" }],
      [{ title: "Per-rep breakdown" }],
      ]}
    />
  );
}
