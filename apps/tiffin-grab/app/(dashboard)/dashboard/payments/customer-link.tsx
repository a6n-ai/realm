import Link from "next/link";
import type { PaymentRow } from "@/lib/payments/facets";
import { HoverHint } from "@/components/ds/hover-hint";

/** Payment tables link the payer to their customer Payments tab; the order lives in the detail dialog. */
export function CustomerLink({ row }: { row: Pick<PaymentRow, "customerPublicId" | "email"> }) {
  const label = row.email ?? "-";
  if (!row.customerPublicId) return <span className="block truncate">{label}</span>;
  return (
    <HoverHint text={row.email}>
      <Link
        href={`/dashboard/customers/${row.customerPublicId}/payments`}
        prefetch={false}
        onClick={(e) => e.stopPropagation()}
        className="block truncate hover:underline"
      >
        {label}
      </Link>
    </HoverHint>
  );
}
