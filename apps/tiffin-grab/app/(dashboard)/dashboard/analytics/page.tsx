import { redirect } from "next/navigation";

// Analytics index has no content of its own — the layout owns the sub-tabs.
// Land on the first sub-section. Guards live in the layout above.
export default function AnalyticsPage() {
  redirect("/dashboard/analytics/overview");
}
