import { redirect } from "next/navigation";

// Only Discounts lives under catalog in xplorers; the breadcrumb links here.
export default function CatalogPage() {
  redirect("/dashboard/catalog/discounts");
}
