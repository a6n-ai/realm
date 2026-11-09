import { Suspense } from "react";
import { and, eq, max } from "drizzle-orm";
import { UsersIcon, PackageIcon, ActivityIcon, WalletIcon, CoinsIcon, CalendarClockIcon } from "lucide-react";
import { formatPhone } from "@foundry/commons";
import { BreadcrumbLabel } from "@/components/dashboard/app-breadcrumbs";
import { PageShell, PageHeader } from "@/components/ds";
import { StatCards, StatCardsSkeleton, type StatCardItem } from "@/components/dashboard/stat-cards";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";
import { formatEpoch, formatDateOnly } from "@/lib/format/datetime";
import { formatMoney } from "@foundry/commons";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { currentRate } from "@/lib/services/wallet-balances.service";
import { Skeleton } from "@foundry/ui/skeleton";
import { walletService } from "@/lib/services/wallet.service";
import { AdjustCoins } from "./adjust-coins";
import { AttachReferral } from "./attach-referral";
import { ResendInviteButton } from "./resend-invite-button";
import { CustomerTabs } from "./customer-tabs";
import { loadCustomer, loadViewer } from "./data";

// One customer, split into tabs (each its own URL) instead of one long page. The header,
// stats and tab bar stay put while a tab loads.
export default async function CustomerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const [{ id }, { isAdmin }] = await Promise.all([params, loadViewer()]);
  return (
    <PageShell>
      <Suspense fallback={<HeaderSkeleton />}>
        <CustomerHeader id={id} />
      </Suspense>
      <CustomerTabs customerPublicId={id} showWallet={isAdmin} />
      {children}
    </PageShell>
  );
}

async function CustomerHeader({ id }: { id: string }) {
  const [data, { isAdmin, timezone }] = await Promise.all([loadCustomer(id), loadViewer()]);
  const [coinBalance, rate, { currency }, [{ planEnd }]] = await Promise.all([
    walletService.balance(data.profile.id),
    currentRate(),
    getAppSettings(),
    db
      .select({ planEnd: max(deliveries.deliveryDate) })
      .from(deliveries)
      .innerJoin(orders, eq(orders.id, deliveries.orderId))
      .where(and(eq(orders.userId, data.profile.id), eq(orders.status, "active"))),
  ]);
  const activeOrders = data.orders.filter((o) => o.status === "active").length;
  const lifetimeSpend = data.orders.reduce((sum, o) => sum + Number(o.total), 0);
  const contact = [data.profile.phone ? formatPhone(data.profile.phone) : null, data.profile.email].filter(Boolean).join(" · ");
  const who = data.profile.name || data.profile.email || "this customer";
  const usd = (v: number) => formatMoney(v, currency);
  // Orders arrive newest first.
  const last = data.orders[0];
  const first = data.orders[data.orders.length - 1];
  const cards: StatCardItem[] = [
    { label: "Orders", value: data.orders.length, icon: PackageIcon, hint: `${activeOrders} active`, href: `/dashboard/customers/${id}/orders` },
    { label: "Active", value: activeOrders, icon: ActivityIcon, hint: activeOrders && planEnd ? `ends ${formatDateOnly(planEnd)}` : "No active plan", href: `/dashboard/customers/${id}/orders?status=active` },
    { label: "Lifetime spend", value: usd(lifetimeSpend), icon: WalletIcon, hint: first ? `since ${formatEpoch(first.createdAt, { mode: "date", timeZone: timezone })}` : "no orders yet" },
    { label: "Wallet coins", value: coinBalance, icon: CoinsIcon, hint: rate == null ? undefined : `≈ ${usd(coinBalance * rate)}` },
    { label: "Last order", value: last ? formatEpoch(last.createdAt, { mode: "date", timeZone: timezone }) : "—", icon: CalendarClockIcon, hint: last ? last.status : "no orders yet" },
  ];
  return (
    <>
      <BreadcrumbLabel segment={id} label={data.profile.name || data.profile.email || "Customer"} />
      <PageHeader
        icon={UsersIcon}
        title={data.profile.name || data.profile.email || "Customer"}
        subtitle={contact || undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <ResendInviteButton email={data.profile.email} />
            {isAdmin ? <AdjustCoins customerPublicId={id} balance={coinBalance} who={who} /> : null}
            {isAdmin ? <AttachReferral customerPublicId={id} /> : null}
          </div>
        }
      />
      <StatCards items={cards} />
    </>
  );
}

function HeaderSkeleton() {
  return (
    <>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-8 w-48" />
      </div>
      <StatCardsSkeleton count={5} />
    </>
  );
}
