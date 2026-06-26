import { redirect } from "next/navigation";

// /dashboard/account has no content of its own — every role has a profile
// section, so land there. The sidebar "Account" link points here.
export default function AccountPage() {
  redirect("/dashboard/account/profile");
}
