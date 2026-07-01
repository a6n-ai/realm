import { redirect } from "next/navigation";

// Discounts index has no content of its own — the layout owns the sub-tabs.
// Land on the first sub-section. Guards live in the layouts above.
export default function DiscountsPage() {
  redirect("/dashboard/settings/discounts/logs");
}
