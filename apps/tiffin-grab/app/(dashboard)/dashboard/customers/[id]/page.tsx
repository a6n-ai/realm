import { CreditCardIcon, MapPinIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { AdminContactForm } from "@/components/dashboard/admin-contact-form";
import { Badge } from "@foundry/ui/badge";
import { SectionCard } from "@/components/ds";
import { formatEpoch } from "@/lib/format/datetime";
import { addressScopeFor, addressService } from "@/lib/services/addresses.service";
import { CustomerInquiriesTable } from "./customer-inquiries-table";
import { loadCustomer, loadViewer } from "./data";

/** Overview tab: money, account basics, contact on file, and inquiries. Orders, renewals and the rest have their own tabs. */
export default async function CustomerOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, { isAdmin, timezone }, saved] = await Promise.all([loadCustomer(id), loadViewer(), addressService.list(await addressScopeFor(id))]);
  // The default saved address is the account's address now; the users.address columns are
  // only a fallback until every customer's book is backfilled.
  const def = saved.find((a) => a.isDefault);
  const address = (
    def
      ? [def.addressUnit ? `${def.addressUnit} – ${def.addressLine}` : def.addressLine, def.city, def.postalCode]
      : [data.profile.addressLine, data.profile.city, data.profile.province, data.profile.postalCode]
  )
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Payment">
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground flex items-center gap-2">
                <CreditCardIcon className="size-4" /> Total paid
              </dt>
              <dd className="tabular-nums font-medium">{formatMoney(data.payment.totalPaid)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Pending verification</dt>
              <dd className="tabular-nums font-medium">{data.payment.pendingCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Last method</dt>
              <dd className="font-medium capitalize">{data.payment.lastMethod ?? "—"}</dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title="Account">
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Customer since</dt>
              <dd className="font-medium">{formatEpoch(data.profile.createdAt, { mode: "date", timeZone: timezone })}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground flex shrink-0 items-center gap-2">
                <MapPinIcon className="size-4" /> Address
              </dt>
              <dd className="text-right font-medium">{address || "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Locale</dt>
              <dd className="font-medium uppercase">{data.profile.locale}</dd>
            </div>
          </dl>
        </SectionCard>
      </div>

      {isAdmin && (
        <SectionCard title="Contact" subtitle="Edit the email and phone on file.">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={data.profile.emailVerified ? "secondary" : "outline"}>
                Email {data.profile.emailVerified ? "verified" : "unverified"}
              </Badge>
            </div>
            <AdminContactForm userId={id} email={data.profile.email ?? ""} phone={data.profile.phone ?? ""} />
          </div>
        </SectionCard>
      )}

      <SectionCard title="Inquiries">
        <CustomerInquiriesTable inquiries={data.inquiries} />
      </SectionCard>
    </>
  );
}
