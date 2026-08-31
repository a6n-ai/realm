import { Suspense } from "react";
import { notFound } from "next/navigation";
import { UsersIcon, PackageIcon, ActivityIcon, WalletIcon, CoinsIcon, PhoneIcon, MailIcon } from "lucide-react";
import { NotFoundError, formatMoney } from "@realm/commons";
import { requireStaff } from "@/lib/auth/guards";
import { getCustomer360 } from "@/lib/services/customers.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { walletService } from "@/lib/services/wallet.service";
import { formatEpoch } from "@/lib/format/datetime";
import { PageShell, PageHeader, Card, SectionCard, ListRow, OrderStatusBadge, EmptyState, SkeletonListRows } from "@/components/ds";
import { Skeleton } from "@realm/ui/skeleton";
import { ResendInviteButton } from "./resend-invite-button";
// Single source of truth for the section cards. The real view and the loading
// twin below both render from this, so the skeleton can never drift from the page.
// Profile isn't a section card — it's the sticky left-rail identity panel (see
// Customer360Data), so it's excluded from this map.
const SECTIONS = {
  timeline: { title: "Activity timeline", skeleton: "rows", rows: 4 },
} as const;
// Orders + Inquiries render side by side in the right column and aren't part
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
  const initial = (data.profile.email ?? data.profile.phone ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr] lg:items-start">
      {/* Left rail: identity + account stats, sticky so it stays in view while
          the right column (orders/inquiries/timeline) scrolls. */}
      <Card className="gap-5 p-5 lg:sticky lg:top-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="bg-muted text-muted-foreground flex size-16 shrink-0 items-center justify-center rounded-full text-2xl font-semibold">
            {initial}
          </span>
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold tracking-tight text-balance">Profile</h2>
            <div className="text-muted-foreground space-y-1 text-sm">
              <div className="flex items-center justify-center gap-1.5">
                <MailIcon className="size-3.5 shrink-0" />
                <span className="truncate">{data.profile.email ?? "no email"}</span>
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <PhoneIcon className="size-3.5 shrink-0" />
                <span className="truncate">{data.profile.phone ?? "no phone"}</span>
              </div>
            </div>
          </div>
          <ResendInviteButton email={data.profile.email} />
        </div>

        <dl className="divide-border -mx-5 divide-y border-t px-5">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-3 py-3">
              <dt className="text-muted-foreground flex items-center gap-2 text-sm">
                <s.icon className="size-4" />
                {s.label}
              </dt>
              <dd className="nums text-sm font-semibold">{s.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* Right column: everything that scrolls — orders, inquiries, timeline. */}
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
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
      </div>
    </div>
  );
}

// Exact loading twin: same SECTIONS + same SectionCard markup, grey blocks
// instead of data. Rendered as the page's <Suspense fallback>, so it always
// matches Customer360Data by construction.
Customer360Data.Skeleton = function Customer360DataSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr] lg:items-start">
      <Card className="gap-5 p-5">
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="size-16 shrink-0 rounded-full" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="divide-border -mx-5 space-y-0 divide-y border-t px-5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
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
      </div>
    </div>
  );
};
