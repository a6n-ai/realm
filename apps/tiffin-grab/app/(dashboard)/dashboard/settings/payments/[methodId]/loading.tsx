import { PaymentsBackLink } from "../back-link";
import { PaymentsFormSkeleton } from "../payments-form";

export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-4">
      <PaymentsBackLink />
      <PaymentsFormSkeleton />
    </div>
  );
}
