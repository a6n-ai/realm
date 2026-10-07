import { redirect } from "next/navigation";

export default function FinancePage() {
  redirect("/dashboard/payments/all");
}
