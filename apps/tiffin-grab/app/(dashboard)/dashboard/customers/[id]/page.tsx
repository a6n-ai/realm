import { Suspense } from "react";
import { notFound } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { NotFoundError } from "@realm/commons";
import { requireStaff } from "@/lib/auth/guards";
import { getCustomer360 } from "@/lib/services/customers.service";
import { formatEpoch } from "@/lib/format/datetime";
import { PageShell, PageHeader, SectionCard, ListRow, OrderStatusBadge, EmptyState, SkeletonListRows } from "@/components/ds";
import { Skeleton } from "@realm/ui/skeleton";

// Single source of truth for the section cards. The real view and the loading
// twin below both render from this, so the skeleton can never drift from the page.
const SECTIONS = {
  profile: { title: "Profile", skeleton: "text" },
  orders: { title: "Orders", skeleton: "rows", rows: 4 },
  inquiries: { title: "Inquiries", skeleton: "rows", rows: 3 },
  timeline: { title: "Activity timeline", skeleton: "rows", rows: 4 },
} as const;

export default function Customer360Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title="Customer" />
      <Suspense fallback={<Customer360Data.Skeleton />}>
        <Customer360Data params={params} />
      </Suspense>
    </PageShell>
  );
}

async function Customer360Data({ params }: { params: Promise<{ id: string }> }) {
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
    <>
      <SectionCard title={SECTIONS.profile.title}>
        <p className="text-sm text-muted-foreground">{data.profile.phone ?? "no phone"} · {data.profile.email ?? "no email"}</p>
      </SectionCard>

      <SectionCard title={SECTIONS.orders.title}>
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

      <SectionCard title={SECTIONS.inquiries.title}>
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

      <SectionCard title={SECTIONS.timeline.title}>
        <div className="space-y-2">
          {data.timeline.map((t) => (
            <ListRow key={t.id} title={t.label} meta={formatEpoch(t.at, { mode: "datetime" })} />
          ))}
        </div>
      </SectionCard>
    </>
  );
}

// Exact loading twin: same SECTIONS + same SectionCard markup, grey blocks
// instead of data. Rendered as the page's <Suspense fallback>, so it always
// matches Customer360Data by construction.
Customer360Data.Skeleton = function Customer360DataSkeleton() {
  return (
    <>
      {Object.values(SECTIONS).map((s) => (
        <SectionCard key={s.title} title={s.title}>
          {s.skeleton === "text" ? <Skeleton className="h-4 w-64" /> : <SkeletonListRows rows={s.rows} />}
        </SectionCard>
      ))}
    </>
  );
};
