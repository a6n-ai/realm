import { redirect } from "next/navigation";

// The breadcrumb's "Renewals" crumb under Inquiries: the list lives in the Inquiries page's Renewals view.
export default function InquiriesRenewalsIndex() {
  redirect("/dashboard/inquiries?view=renewals");
}
