import { Suspense } from "react";
import { notFound } from "next/navigation";
import { UsersIcon, PackageIcon, ActivityIcon, WalletIcon, CoinsIcon } from "lucide-react";
import { NotFoundError, formatMoney } from "@realm/commons";
import { requireStaff } from "@/lib/auth/guards";
import { getCustomer360 } from "@/lib/services/customers.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { walletService } from "@/lib/services/wallet.service";
import { formatEpoch } from "@/lib/format/datetime";
import { PageShell, PageHeader, SectionCard, ListRow, OrderStatusBadge, EmptyState, StatGrid, SkeletonListRows, SkeletonStatCards } from "@/components/ds";
import { Skeleton } from "@realm/ui/skeleton";
import { ResendInviteButton } from "./resend-invite-button";
// Single source of truth for the section cards. The real view and the loading
// twin below both render from this, so the skeleton can never drift from the page.
// Profile isn't a section card — it renders as a heading row above them (see
// Customer360Data), so it's excluded from this map.
const SECTIONS = {
  timeline: { title: "Activity timeline", skeleton: "rows", rows: 4 },
} as const;
// Orders + Inquiries render side by side (see Customer360Data) and aren't part
// of the single-column SECTIONS map, but keep their titles here too so the
// skeleton twin can't drift from the real headings.
const SIDE_BY_SIDE_TITLES = { orders: "Orders", inquiries: "Inquiries" } as const;

// This page is the index across a person's subscriptions — each row links into the order
// page, which owns the calendar, meal picks, payment, and log for that one order.

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

  const settingsP = getAppSettings();
  let data;
  try {
    data = await getCustomer360(id);
  } catch (e) {
    void settingsP.catch(() => {});
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const [{ timezone }, coinBalance] = await Promise.all([settingsP, walletService.balance(data.profile.id)]);

  const activeOrders = data.orders.filter((o) => o.status === "active").length;
  const lifetimeSpend = data.orders.reduce((sum, o) => sum + Number(o.total), 0);
  const stats = [
    { label: "Orders", value: data.orders.length, icon: PackageIcon },
    { label: "Active", value: activeOrders, icon: ActivityIcon },
    { label: "Lifetime spend", value: formatMoney(lifetimeSpend), icon: WalletIcon },
    { label: "Wallet coins", value: coinBalance, icon: CoinsIcon },
  ];

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Profile</h2>
          <p className="text-sm text-muted-foreground">{data.profile.phone ?? "no phone"} · {data.profile.email ?? "no email"}</p>
        </div>
        <ResendInviteButton email={data.profile.email} />
      </div>

      <StatGrid cols={4} items={stats} />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={SIDE_BY_SIDE_TITLES.orders}>
          {data.orders.length === 0 ? (
            <EmptyState icon={UsersIcon} message="No orders for this customer." />
          ) : (
            <div className="space-y-2">
              {data.orders.map((o) => (
                <ListRow key={o.publicId} title={`${o.deploymentId} · ${o.planName}`} meta={`${o.city} · start ${o.startDate}`} trailing={<OrderStatusBadge status={o.status} />} href={`/dashboard/orders/${o.publicId}`} />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={SIDE_BY_SIDE_TITLES.inquiries}>
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
      </div>

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
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <SkeletonStatCards count={4} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={SIDE_BY_SIDE_TITLES.orders}>
          <SkeletonListRows rows={4} />
        </SectionCard>
        <SectionCard title={SIDE_BY_SIDE_TITLES.inquiries}>
          <SkeletonListRows rows={3} />
        </SectionCard>
      </div>
      {Object.values(SECTIONS).map((s) => (
        <SectionCard key={s.title} title={s.title}>
          <SkeletonListRows rows={s.rows} />
        </SectionCard>
      ))}
    </>
  );
};
