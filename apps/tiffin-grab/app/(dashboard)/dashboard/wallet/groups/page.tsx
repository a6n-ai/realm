import { redirect } from "next/navigation";

export default function WalletGroupsRedirect() {
  redirect("/dashboard/customer-groups");
}
