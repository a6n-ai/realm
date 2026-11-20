import { AnalyticsTabSkeleton } from "@/components/dashboard/analytics/skeletons";

export default function Loading() {
  return (
    <AnalyticsTabSkeleton
      description="What sells, in which plan and size, and what customers pick."
      statRows={1}
      rows={[
      [{ title: "Sales by plan and size", height: 340 }, { title: "Which meal size tier earns the most?" }],
      [{ title: "Which sizes sell in which diet?" }, { title: "Veg or non-veg?" }],
      [{ title: "Add-ons sold" }, { title: "How long do they buy for?" }],
      ]}
    />
  );
}
