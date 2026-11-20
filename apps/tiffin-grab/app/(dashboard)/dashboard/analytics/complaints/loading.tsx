import { AnalyticsTabSkeleton } from "@/components/dashboard/analytics/skeletons";

export default function Loading() {
  return (
    <AnalyticsTabSkeleton
      description="Tickets raised in this range, and which ones still need a reply."
      statRows={1}
      rows={[
      [{ title: "Complaints calendar" }, { title: "By delivery zone" }],
      [{ title: "By category" }, { title: "By sub-category" }],
      [{ title: "Status" }, { title: "By plan" }],
      [{ title: "Customers with repeat complaints" }],
      ]}
    />
  );
}
