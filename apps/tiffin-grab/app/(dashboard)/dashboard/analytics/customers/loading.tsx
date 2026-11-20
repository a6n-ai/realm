import { AnalyticsTabSkeleton } from "@/components/dashboard/analytics/skeletons";

export default function Loading() {
  return (
    <AnalyticsTabSkeleton
      description="Who is subscribed, who is paused, and where new accounts are coming from."
      statRows={1}
      rows={[
      [{ title: "Signups by day" }, { title: "Signups calendar" }],
      [{ title: "Subscription status" }, { title: "Top cities" }],
      ]}
    />
  );
}
