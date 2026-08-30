import Link from "next/link";
import { notFound } from "next/navigation";
import { UserIcon } from "lucide-react";
import { formatMoney } from "@realm/commons";
import { PageHeader, PageShell, SectionCard, StatGrid } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { requirePermission } from "@/lib/auth/guards";
import { getCustomerDetail } from "@/lib/services/customers.service";

/** Toronto wall-clock, like the rest of the app's operator-facing timestamps. */
const shopDateTime = (ms: number) =>
  new Date(ms).toLocaleString("en-CA", { timeZone: "America/Toronto" });
const shopDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission({ user: ["get"] });

  const { id } = await params;
  const customer = await getCustomerDetail(id);
  if (!customer) notFound();

  return (
    <PageShell>
      <PageHeader
        icon={UserIcon}
        title={customer.name ?? "Customer"}
        subtitle={customer.email ?? undefined}
        actions={
          <Link href="/dashboard/customers" className="text-muted-foreground text-sm hover:underline">
            ← All customers
          </Link>
        }
      />
      <StatGrid
        cols={3}
        items={[
          { label: "Orders", value: String(customer.orderCount) },
          { label: "Spent", value: formatMoney(Number(customer.totalSpent)), hint: "paid + fulfilled" },
          { label: "Joined", value: shopDate(customer.createdAt) },
        ]}
      />
      <SectionCard title="Profile">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Field label="Email">
            {customer.email ?? "—"}
            {customer.email && customer.emailVerified ? (
              <Badge variant="outline" className="ml-2">verified</Badge>
            ) : null}
          </Field>
          <Field label="Phone">
            {customer.phone ?? "—"}
            {customer.phone && customer.phoneVerified ? (
              <Badge variant="outline" className="ml-2">verified</Badge>
            ) : null}
          </Field>
          <Field label="Status">
            <Badge variant={customer.status === "active" ? "default" : "destructive"}>
              {customer.status}
            </Badge>
          </Field>
          <Field label="Customer id">
            <span className="font-mono text-xs">{customer.publicId}</span>
          </Field>
        </dl>
      </SectionCard>
      <SectionCard title="Orders">
        {customer.orders.length === 0 ? (
          <p className="text-muted-foreground text-sm">No orders yet.</p>
        ) : (
          <ul className="divide-y">
            {customer.orders.map((o) => (
              <li key={o.publicId} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/dashboard/orders/${o.publicId}`} className="font-mono text-xs hover:underline">
                  {o.publicId}
                </Link>
                <Badge variant="outline">{o.status}</Badge>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {shopDateTime(o.createdAt)}
                </span>
                <span className="tabular-nums">{formatMoney(Number(o.total))}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
