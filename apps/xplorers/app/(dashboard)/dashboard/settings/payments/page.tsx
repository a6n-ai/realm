import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { getPaymentConfig } from "@/lib/services/app-settings.service";
import { ProviderCatalog } from "./provider-catalog";

export default async function PaymentsSettingsIndex() {
  await requireAdmin();
  const cfg = await getPaymentConfig();
  const first = cfg.methods[0];
  if (first) redirect(`/dashboard/settings/payments/${first.id}`);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="font-medium">Add a payment provider</p>
        <p className="text-muted-foreground text-sm">
          Manual rails first — e-Transfer, cash, or other. Card providers can plug in later.
        </p>
      </div>
      <ProviderCatalog installedIds={[]} />
    </div>
  );
}
