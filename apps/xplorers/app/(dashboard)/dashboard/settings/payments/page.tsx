import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";

export default async function PaymentsSettingsIndex() {
  await requireAdmin();
  redirect("/dashboard/settings/payments/cash");
}
