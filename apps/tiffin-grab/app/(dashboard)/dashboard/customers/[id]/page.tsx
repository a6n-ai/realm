import { Suspense } from "react";
import { notFound } from "next/navigation";
import { UsersIcon, PackageIcon, ActivityIcon, WalletIcon, CoinsIcon, CreditCardIcon, MapPinIcon } from "lucide-react";
import { NotFoundError, formatMoney, formatPhone } from "@realm/commons";
import { requireStaff } from "@/lib/auth/guards";
import { getCustomer360 } from "@/lib/services/customers.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { walletService } from "@/lib/services/wallet.service";
import { DataTable, PageShell, PageHeader, SectionCard, StatGrid, SkeletonStatCards } from "@/components/ds";
import { Skeleton } from "@realm/ui/skeleton";
import { formatEpoch } from "@/lib/format/datetime";
import { ResendInviteButton } from "./resend-invite-button";
import { CustomerOrdersTable, CUSTOMER_ORDERS_COLUMNS } from "./customer-orders-table";
import { CustomerInquiriesTable, CUSTOMER_INQUIRIES_COLUMNS } from "./customer-inquiries-table";
import { CustomerTimeline, CUSTOMER_TIMELINE_COLUMNS } from "./customer-timeline";

// Section titles — single source of truth so the skeleton twin below can never drift.
const SECTIONS = {
  orders: "Orders",
  inquiries: "Inquiries",
  payment: "Payment",
  account: "Account",
  timeline: "Activity timeline",
} as const;

// This page is the index across a person's subscriptions — each row links into the order
// page, which owns the calendar, meal picks, payment, and log for that one order.

export default function Customer360Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageShell>
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

  const contact = [data.profile.phone ? formatPhone(data.profile.phone) : null, data.profile.email]
    .filter(Boolean)
    .join(" · ");
  const address = [data.profile.addressLine, data.profile.city, data.profile.province, data.profile.postalCode]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      {/* Identity as the page heading, not a separate card — name/contact is what
          you're here to look at, not one more box among equals. */}
      <PageHeader
        icon={UsersIcon}
        title={data.profile.name || data.profile.email || "Customer"}
        subtitle={contact || undefined}
        actions={<ResendInviteButton email={data.profile.email} />}
      />

      <StatGrid cols={4} items={stats} />

      {/* Orders gets its own full-width row — its columns (deployment, plan, city,
          status, start, total, created) need the room a half-width card starves it of. */}
      <SectionCard title={SECTIONS.orders}>
        <CustomerOrdersTable orders={data.orders} />
      </SectionCard>

      <SectionCard title={SECTIONS.inquiries}>
        <CustomerInquiriesTable inquiries={data.inquiries} />
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title={SECTIONS.payment}>
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

        <SectionCard title={SECTIONS.account}>
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

      <SectionCard title={SECTIONS.timeline}>
        <CustomerTimeline entries={data.timeline} timezone={timezone} />
      </SectionCard>
    </>
  );
}

// Exact loading twin: same section titles + same markup, grey blocks instead of
// data. Rendered as the page's <Suspense fallback>, so it always matches
// Customer360Data by construction.
Customer360Data.Skeleton = function Customer360DataSkeleton() {
  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-8 w-48" />
        </div>
      </div>

      <SkeletonStatCards count={4} />

      <SectionCard title={SECTIONS.orders}>
        <DataTable.Skeleton columns={CUSTOMER_ORDERS_COLUMNS} idLabel="Deployment" hasId />
      </SectionCard>
      <SectionCard title={SECTIONS.inquiries}>
        <DataTable.Skeleton columns={CUSTOMER_INQUIRIES_COLUMNS} />
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title={SECTIONS.payment}>
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
          </div>
        </SectionCard>
        <SectionCard title={SECTIONS.account}>
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
          </div>
        </SectionCard>
      </div>

      <SectionCard title={SECTIONS.timeline}>
        <DataTable.Skeleton columns={CUSTOMER_TIMELINE_COLUMNS} />
      </SectionCard>
    </>
  );
};
