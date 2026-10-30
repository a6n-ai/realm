import { Suspense } from "react";
import { UsersIcon, PackageIcon, ActivityIcon, WalletIcon, CoinsIcon } from "lucide-react";
import { formatMoney, formatPhone } from "@foundry/commons";
import { PageShell, PageHeader, StatGrid, SkeletonStatCards } from "@/components/ds";
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
  const { id } = await params;
  return (
    <PageShell>
      <Suspense fallback={<HeaderSkeleton />}>
        <CustomerHeader id={id} />
      </Suspense>
      <CustomerTabs customerPublicId={id} />
      {children}
    </PageShell>
  );
}

async function CustomerHeader({ id }: { id: string }) {
  const [data, { isAdmin }] = await Promise.all([loadCustomer(id), loadViewer()]);
  const coinBalance = await walletService.balance(data.profile.id);
  const activeOrders = data.orders.filter((o) => o.status === "active").length;
  const lifetimeSpend = data.orders.reduce((sum, o) => sum + Number(o.total), 0);
  const contact = [data.profile.phone ? formatPhone(data.profile.phone) : null, data.profile.email].filter(Boolean).join(" · ");
  const who = data.profile.name || data.profile.email || "this customer";
  return (
    <>
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
      <StatGrid
        cols={4}
        items={[
          { label: "Orders", value: data.orders.length, icon: PackageIcon },
          { label: "Active", value: activeOrders, icon: ActivityIcon },
          { label: "Lifetime spend", value: formatMoney(lifetimeSpend), icon: WalletIcon },
          { label: "Wallet coins", value: coinBalance, icon: CoinsIcon },
        ]}
      />
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
      <SkeletonStatCards count={4} />
    </>
  );
}
