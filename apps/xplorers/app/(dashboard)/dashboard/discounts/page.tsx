import { redirect } from "next/navigation";

// Index has no content; the layout owns the sub-tabs. Same shape as tiffin-grab.
export default function DiscountsPage() {
  redirect("/dashboard/catalog/discounts");
}
