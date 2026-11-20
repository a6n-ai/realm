import { AnalyticsTabSkeleton } from "@/components/dashboard/analytics/skeletons";

export default function Loading() {
  return (
    <AnalyticsTabSkeleton
      description="Inquiries by stage, why they were lost, and which sources convert."
      statRows={1}
      rows={[
      [{ title: "Lead stages" }, { title: "Where each source's leads went" }],
      [{ title: "Source performance" }, { title: "Lost reasons" }],
      [{ title: "Renewals by round" }],
      ]}
    />
  );
}
