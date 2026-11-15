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
import { getAppSettings } from "@/lib/settings";
import { currentRate } from "@/lib/wallet/wallet-balances.service";
import { Skeleton } from "@foundry/ui/skeleton";
import { walletService } from "@/lib/wallet/wallet.service";
import { AdjustCoins } from "./adjust-coins";
import { AttachReferral } from "./attach-referral";
import { ResendInviteButton } from "./resend-invite-button";
import { CustomerTabs } from "./customer-tabs";
import { loadCustomer, loadViewer } from "./data";

// One customer, split into tabs (each its own URL) instead of one long page. The header,
// stats and tab bar stay put while a tab loads.
export default async function CustomerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const [{ id }, { canWallet, canOrder, canFinance }] = await Promise.all([params, loadViewer()]);
  // A tab the viewer can't open is not offered; its route still checks the permission itself.
  const hiddenTabs = [
    ...(canWallet ? [] : ["/wallet"]),
    ...(canOrder ? [] : ["/orders", "/renewals"]),
    ...(canFinance ? [] : ["/payments"]),
  ];
  return (
    <PageShell>
      <Suspense fallback={<HeaderSkeleton />}>
        <CustomerHeader id={id} />
      </Suspense>
      <CustomerTabs customerPublicId={id} hidden={hiddenTabs} />
      {children}
    </PageShell>
  );
}

async function CustomerHeader({ id }: { id: string }) {
  const [data, { canGive, canWallet, canOrder, canFinance, timezone }] = await Promise.all([loadCustomer(id), loadViewer()]);
  const [coinBalance, rate, { currency }, [{ planEnd }]] = await Promise.all([
    canWallet ? walletService.balance(data.profile.id) : 0,
    canWallet ? currentRate() : null,
    getAppSettings(),
    canOrder
      ? db
          .select({ planEnd: max(deliveries.deliveryDate) })
          .from(deliveries)
          .innerJoin(orders, eq(orders.id, deliveries.orderId))
          .where(and(eq(orders.userId, data.profile.id), eq(orders.status, "active")))
      : [{ planEnd: null }],
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
    ...(canOrder ? [
      { label: "Orders", value: data.orders.length, icon: PackageIcon, hint: `${activeOrders} active`, href: `/dashboard/customers/${id}/orders` },
      { label: "Active", value: activeOrders, icon: ActivityIcon, hint: activeOrders && planEnd ? `ends ${formatDateOnly(planEnd)}` : "No active plan", href: `/dashboard/customers/${id}/orders?status=active` },
    ] : []),
    ...(canFinance ? [{ label: "Lifetime spend", value: usd(lifetimeSpend), icon: WalletIcon, hint: first ? `since ${formatEpoch(first.createdAt, { mode: "date", timeZone: timezone })}` : "no orders yet" }] : []),
    ...(canWallet ? [{ label: "Wallet coins", value: coinBalance, icon: CoinsIcon, hint: rate == null ? undefined : `≈ ${usd(coinBalance * rate)}` }] : []),
    ...(canOrder ? [{ label: "Last order", value: last ? formatEpoch(last.createdAt, { mode: "date", timeZone: timezone }) : "—", icon: CalendarClockIcon, hint: last ? last.status : "no orders yet" }] : []),
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
            {canGive ? <AdjustCoins customerPublicId={id} balance={coinBalance} who={who} /> : null}
            {canGive ? <AttachReferral customerPublicId={id} /> : null}
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
