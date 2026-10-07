import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { formatMoney } from "@foundry/commons";
import { EmptyState, PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { CoinsIcon, ReceiptIcon, WalletIcon } from "lucide-react";
import { FinancesTabs } from "@/components/customer/wallet/finances-tabs";
import { parseFinancesTab } from "@/components/customer/wallet/finances-tab";
import { getSession } from "@/lib/auth/session";
import { getAppClock } from "@/lib/services/app-settings.service";
import { myMoneyLedgerPage, myPaymentsPage } from "@/lib/services/customer-finances.service";
import { currentUserId } from "@/lib/services/session-service";
import { walletService } from "@/lib/services/wallet.service";
import { formatSessionDay } from "@/lib/sessions/format";

type SearchParams = Promise<{ tab?: string }>;

export default async function CustomerWalletPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const tab = parseFinancesTab(sp.tab);

  return (
    <PageShell>
      <PageHeader
        icon={WalletIcon}
        title="Finances"
        subtitle="Coins, payments, and money transactions in one place."
      />
      <FinancesTabs active={tab} />
      {tab === "coins" ? (
        <Suspense fallback={<CoinsSkeleton />}>
          <CoinsPanel />
        </Suspense>
      ) : null}
      {tab === "payments" ? (
        <Suspense fallback={<ListSkeleton />}>
          <PaymentsPanel />
        </Suspense>
      ) : null}
      {tab === "transactions" ? (
        <Suspense fallback={<ListSkeleton />}>
          <TransactionsPanel />
        </Suspense>
      ) : null}
    </PageShell>
  );
}

async function CoinsPanel() {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=/me/wallet");
  const [{ timezone }, wallet] = await Promise.all([
    getAppClock(),
    walletService.coinsForFamily(session.user.id, 40),
  ]);

  if (!wallet) {
    return (
      <EmptyState
        icon={CoinsIcon}
        message="The coin wallet is not available right now."
      />
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title={`${wallet.balance.toLocaleString()} coins`}
        subtitle={
          wallet.held
            ? `Worth ${wallet.value}. ${wallet.held.toLocaleString()} more held for an unpaid booking until it's paid.`
            : `Worth ${wallet.value}. Use them when you book.`
        }
      >
        {wallet.recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">No coin activity yet.</p>
        ) : (
          <ul className="divide-border divide-y text-sm">
            {wallet.recent.map((r) => (
              <li key={r.publicId} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {r.label}
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatSessionDay(new Date(r.when), timezone)}
                  </span>
                </span>
                <span className="tabular-nums font-medium">
                  {r.credit ? "+" : "−"}
                  {r.coins}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

async function PaymentsPanel() {
  const userId = await currentUserId();
  if (userId == null) redirect("/login?callbackUrl=/me/wallet");
  const [{ timezone }, page] = await Promise.all([
    getAppClock(),
    myPaymentsPage(userId, { page: 0, size: 50 }),
  ]);

  if (page.items.length === 0) {
    return <EmptyState icon={ReceiptIcon} message="No payments yet. Book a class to get started." />;
  }

  return (
    <SectionCard title="Payments" subtitle="Your booking payments and claim links.">
      <ul className="divide-border divide-y text-sm">
        {page.items.map((p) => {
          const claimable = p.status === "awaiting_payment" || p.status === "pending_verification";
          return (
            <li key={p.publicId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">{p.sessionTitle}</p>
                <p className="text-muted-foreground">
                  {formatSessionDay(new Date(p.createdAt), timezone)} · {p.method}
                  {p.reference ? ` · ${p.reference}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums font-medium">
                  {formatMoney(Number(p.amount), p.currency)}
                </span>
                <Badge variant={p.status === "paid" ? "default" : "outline"}>{p.status.replaceAll("_", " ")}</Badge>
                {claimable ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/me/pay/${p.publicId}`}>Pay</Link>
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

async function TransactionsPanel() {
  const userId = await currentUserId();
  if (userId == null) redirect("/login?callbackUrl=/me/wallet");
  const [{ timezone }, page] = await Promise.all([
    getAppClock(),
    myMoneyLedgerPage(userId, { page: 0, size: 50 }),
  ]);

  if (page.items.length === 0) {
    return <EmptyState icon={ReceiptIcon} message="No money transactions yet." />;
  }

  return (
    <SectionCard title="Transactions" subtitle="Money ledger for your bookings.">
      <ul className="divide-border divide-y text-sm">
        {page.items.map((r) => (
          <li key={r.publicId} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium capitalize">{r.type}</p>
              <p className="text-muted-foreground">
                {formatSessionDay(new Date(r.createdAt), timezone)}
                {r.memo ? ` · ${r.memo}` : ""}
              </p>
            </div>
            <span className="tabular-nums font-medium">
              {r.direction === "credit" ? "+" : "−"}
              {formatMoney(Number(r.amount), r.currency)}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function CoinsSkeleton() {
  return (
    <div className="bg-card space-y-3 rounded-xl border p-5 shadow-sm">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="bg-card space-y-3 rounded-xl border p-5 shadow-sm">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
