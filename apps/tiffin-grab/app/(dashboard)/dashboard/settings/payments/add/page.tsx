import { Suspense } from "react";
import { getPaymentConfig } from "@/lib/payments/payment-config";
import { ProviderCatalogSkeleton } from "../provider-catalog";
import { ProviderCatalogLoader } from "../provider-catalog-loader";
import { PaymentsBackLink } from "../back-link";

/** Reachable from the Payment page's "Add payment method" row. */
export default async function AddPaymentProviderPage() {
  const cfg = await getPaymentConfig();

  return (
    <div className="flex flex-col gap-4">
      <PaymentsBackLink />
      <h2 className="text-base font-semibold tracking-tight">Add a payment method</h2>
      <Suspense fallback={<ProviderCatalogSkeleton />}>
        <ProviderCatalogLoader methodIds={cfg.methods.map((m) => m.id)} />
      </Suspense>
    </div>
  );
}
