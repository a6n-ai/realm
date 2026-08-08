import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { getPaymentConfig } from "@/lib/services/app-settings.service";
import { ProviderCatalogSkeleton } from "../provider-catalog";
import { ProviderCatalogLoader } from "../provider-catalog-loader";

/** Reachable from PaymentTabs' "Add provider" trigger — the only way to gain a
 * second/third provider once the index route redirects past the catalog. */
export default async function AddPaymentProviderPage() {
  await requireAdmin();
  const cfg = await getPaymentConfig();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="font-medium">Add a payment provider</p>
        <p className="text-muted-foreground text-sm">
          Every installed method already gets its own tab above.
        </p>
      </div>
      <Suspense fallback={<ProviderCatalogSkeleton />}>
        <ProviderCatalogLoader installedIds={cfg.methods.map((m) => m.id)} />
      </Suspense>
    </div>
  );
}
