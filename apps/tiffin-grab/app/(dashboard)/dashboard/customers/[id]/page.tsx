import { Suspense } from "react";
import { notFound } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { NotFoundError } from "@realm/commons";
import { requireStaff } from "@/lib/auth/guards";
import { getCustomer360 } from "@/lib/services/customers.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { formatEpoch } from "@/lib/format/datetime";
import { PageShell, PageHeader, SectionCard, ListRow, OrderStatusBadge, EmptyState, SkeletonListRows } from "@/components/ds";
import { Skeleton } from "@realm/ui/skeleton";
import { SubscriptionPanel, SubscriptionPanelSkeleton } from "./subscription-panel";
import { SubscriptionSwitcher } from "./subscription-switcher";
import { selectSubscription } from "./select-subscription";

// Single source of truth for the section cards. The real view and the loading
// twin below both render from this, so the skeleton can never drift from the page.
const SECTIONS = {
  profile: { title: "Profile", skeleton: "text" },
  subscription: { title: "Subscription", skeleton: "text" },
  orders: { title: "Orders", skeleton: "rows", rows: 4 },
  inquiries: { title: "Inquiries", skeleton: "rows", rows: 3 },
  timeline: { title: "Activity timeline", skeleton: "rows", rows: 4 },
} as const;

type SearchParams = Promise<{ order?: string; month?: string }>;

export default function Customer360Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title="Customer" />
      <Suspense fallback={<Customer360Data.Skeleton />}>
        <Customer360Data params={params} searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function Customer360Data({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  await requireStaff();
  const { id } = await params;
  const { order: orderParam, month } = await searchParams;

  const settingsP = getAppSettings();
  let data;
  try {
    data = await getCustomer360(id);
  } catch (e) {
    void settingsP.catch(() => {});
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { timezone } = await settingsP;
  const basePath = `/dashboard/customers/${id}`;
  const selected = selectSubscription(data.orders, orderParam);

  return (
    <>
      <SectionCard title={SECTIONS.profile.title}>
        <p className="text-sm text-muted-foreground">{data.profile.phone ?? "no phone"} · {data.profile.email ?? "no email"}</p>
      </SectionCard>

      {selected ? (
        <>
          <SectionCard title={SECTIONS.subscription.title}>
            <SubscriptionSwitcher orders={data.orders} selected={selected} basePath={basePath} />
          </SectionCard>
          <SubscriptionPanel
            orderPublicId={selected.publicId}
            monthParam={month}
            basePath={basePath}
          />
        </>
      ) : null}

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
            <ListRow key={t.id} title={t.label} meta={formatEpoch(t.at, { mode: "datetime", timeZone: timezone })} />
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
  const { profile, subscription, ...rest } = SECTIONS;
  return (
    <>
      <SectionCard title={profile.title}>
        <Skeleton className="h-4 w-64" />
      </SectionCard>
      <SectionCard title={subscription.title}>
        <Skeleton className="h-8 w-56" />
      </SectionCard>
      {/* The panel's own cards sit between the switcher and the lists on the real page. */}
      <SubscriptionPanelSkeleton />
      {Object.values(rest).map((s) => (
        <SectionCard key={s.title} title={s.title}>
          <SkeletonListRows rows={s.rows} />
        </SectionCard>
      ))}
    </>
  );
};
