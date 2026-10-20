import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { getPaymentConfig } from "@/lib/services/app-settings.service";
import { ProviderCatalogSkeleton } from "../provider-catalog";
import { ProviderCatalogLoader } from "../provider-catalog-loader";
import { PaymentsBackLink } from "../back-link";

/** Reachable from the hub's Payment providers card "Add provider" action. */
export default async function AddPaymentProviderPage() {
  await requireAdmin();
  const cfg = await getPaymentConfig();

  return (
    <div className="space-y-4">
      <PaymentsBackLink />
      <div className="space-y-1">
        <p className="font-medium">Add a payment provider</p>
        <p className="text-muted-foreground text-sm">
          Installed providers are listed on the Payment page.
        </p>
      </div>
      <Suspense fallback={<ProviderCatalogSkeleton />}>
        <ProviderCatalogLoader methodIds={cfg.methods.map((m) => m.id)} />
      </Suspense>
    </div>
  );
}
