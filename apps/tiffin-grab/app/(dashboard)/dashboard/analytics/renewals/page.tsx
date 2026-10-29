import { redirect } from "next/navigation";

// Renewals is its own page now.
export default function AnalyticsRenewalsPage() {
  redirect("/dashboard/renewals");
}
