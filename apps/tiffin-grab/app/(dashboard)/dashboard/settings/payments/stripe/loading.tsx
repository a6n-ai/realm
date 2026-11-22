import { PaymentsBackLink } from "../back-link";
import { StripeSettingsSkeleton } from "./stripe-settings-skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" className="grid gap-4">
      <PaymentsBackLink />
      <StripeSettingsSkeleton />
    </div>
  );
}
