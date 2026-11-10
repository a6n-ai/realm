import Link from "next/link";
import type { PaymentRow } from "./payment-facets";

/** Payment tables link the payer to their customer Payments tab; the order lives in the detail dialog. */
export function CustomerLink({ row }: { row: Pick<PaymentRow, "customerPublicId" | "email"> }) {
  const label = row.email ?? "-";
  if (!row.customerPublicId) return <span className="block truncate">{label}</span>;
  return (
    <Link
      href={`/dashboard/customers/${row.customerPublicId}/payments`}
      prefetch={false}
      title={row.email ?? undefined}
      onClick={(e) => e.stopPropagation()}
      className="block truncate hover:underline"
    >
      {label}
    </Link>
  );
}
