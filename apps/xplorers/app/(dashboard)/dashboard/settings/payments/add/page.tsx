import { requireAdmin } from "@/lib/auth/guards";
import { getPaymentConfig } from "@/lib/services/app-settings.service";
import { ProviderCatalog } from "../provider-catalog";

export default async function AddPaymentProviderPage() {
  await requireAdmin();
  const cfg = await getPaymentConfig();
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="font-medium">Add a payment provider</p>
        <p className="text-muted-foreground text-sm">Every installed method already has its own tab above.</p>
      </div>
      <ProviderCatalog installedIds={cfg.methods.map((m) => m.id)} />
    </div>
  );
}
