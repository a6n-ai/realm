import { notFound } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { NotFoundError } from "@tiffin/commons";
import { requireStaff } from "@/lib/auth/guards";
import { getCustomer360 } from "@/lib/services/customers.service";
import { formatEpoch } from "@/lib/format/datetime";
import { PageShell, PageHeader, SectionCard, ListRow, OrderStatusBadge, EmptyState } from "@/components/ds";

export default async function Customer360Page({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  let data;
  try {
    data = await getCustomer360(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title={data.profile.email ?? data.profile.publicId} breadcrumbOverrides={{ [data.profile.publicId]: data.profile.email ?? data.profile.publicId }} />

      <SectionCard title="Profile">
        <p className="text-sm text-muted-foreground">{data.profile.phone ?? "no phone"} · {data.profile.email ?? "no email"}</p>
      </SectionCard>

      <SectionCard title="Orders">
        {data.orders.length === 0 ? (
          <EmptyState icon={UsersIcon} message="No orders for this customer." />
        ) : (
          <div className="space-y-2">
            {data.orders.map((o) => (
              <ListRow key={o.publicId} title={o.deploymentId} meta={`${o.city} · start ${o.startDate}`} trailing={<OrderStatusBadge status={o.status} />} href={`/dashboard/orders/${o.publicId}`} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Inquiries">
        {data.inquiries.length === 0 ? (
          <p className="text-muted-foreground text-sm">No matching inquiries.</p>
        ) : (
          <div className="space-y-2">
            {data.inquiries.map((i) => (
              <ListRow key={i.publicId} title={i.fullName} meta={`${i.source} · ${i.stage}`} href={`/dashboard/inquiries/${i.publicId}`} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Activity timeline">
        <div className="space-y-2">
          {data.timeline.map((t, idx) => (
            <ListRow key={idx} title={t.label} meta={formatEpoch(t.at, { mode: "datetime" })} />
          ))}
        </div>
      </SectionCard>
    </PageShell>
  );
}
