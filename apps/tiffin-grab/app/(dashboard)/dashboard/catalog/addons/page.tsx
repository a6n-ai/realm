import { redirect } from "next/navigation";

// Add-ons now live as a tab on Dishes & Categories; keep old links working.
export default function AddonsPage() {
  redirect("/dashboard/catalog/dishes");
}
