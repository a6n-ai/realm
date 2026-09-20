import { redirect } from "next/navigation";

export default function PaymentsIndex() {
  redirect("/dashboard/payments/requests");
}
