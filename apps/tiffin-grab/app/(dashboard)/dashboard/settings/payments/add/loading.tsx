import { PaymentsBackLink } from "../back-link";
import { ProviderCatalogSkeleton } from "../provider-catalog";

export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <PaymentsBackLink />
      <h2 className="text-base font-semibold tracking-tight">Add a payment method</h2>
      <ProviderCatalogSkeleton />
    </div>
  );
}
