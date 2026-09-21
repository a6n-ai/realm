import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { ensurePaymentCatalog } from "@/lib/services/app-settings.service";

export default async function PaymentsSettingsIndex() {
  await requireAdmin();
  const cfg = await ensurePaymentCatalog();
  const first = cfg.methods.find((m) => m.id === "cash") ?? cfg.methods[0];
  redirect(`/dashboard/settings/payments/${first?.id ?? "cash"}`);
}
