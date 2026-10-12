import { redirect } from "next/navigation";

// Drafts are created by the "New campaign" button (a form post). An old link or bookmark lands on the list.
export default function NewCampaignPage() {
  redirect("/dashboard/notifications/campaigns");
}
