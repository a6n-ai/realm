import { redirect } from "next/navigation";

// The wizard lives in a dialog on the list page now; old links open it.
export default function NewCustomerGroupPage() {
  redirect("/dashboard/customer-groups?new=1");
}
