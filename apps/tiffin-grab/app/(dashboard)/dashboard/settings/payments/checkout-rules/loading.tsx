import { SectionCard, SkeletonTable } from "@/components/ds";
import { PaymentsBackLink } from "../back-link";

export default function Loading() {
  return (
    <div aria-busy="true" className="grid gap-6">
      <PaymentsBackLink />
      <SectionCard
        title="Sales tax by province"
        subtitle="Tax is charged by the delivery address's province, on the order total after discounts and coins. Defaults are standard GST/HST/PST rates — confirm with your accountant whether prepared meals are taxable in each province, and set a line to 0% if it doesn't apply."
      >
        <SkeletonTable columns={5} rows={13} />
      </SectionCard>
    </div>
  );
}
