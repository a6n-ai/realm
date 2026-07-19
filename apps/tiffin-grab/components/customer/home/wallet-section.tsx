"use client";

import { CoinsIcon } from "lucide-react";
import { Skeleton } from "@realm/ui/skeleton";
import { Card, SectionCard } from "@/components/ds";
import { AnimatedNumber, LottieEmptyState, TransitionLink } from "@/components/motion";
import { eventLabel } from "@/components/notifications/template-status";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { WalletTx } from "@/lib/services/wallet.service";

function WalletTxRow({ tx }: { tx: WalletTx }) {
  const tz = useTimezone();
  const credit = tx.direction === "credit";
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{tx.eventType ? eventLabel(tx.eventType) : eventLabel(tx.sourceType)}</p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {formatEpoch(tx.createdAt, { mode: "datetime", timeZone: tz })}
        </p>
      </div>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${credit ? "text-ok" : "text-bad"}`}>
        {credit ? "+" : "−"}
        {tx.coins}
      </span>
    </div>
  );
}

export function WalletSection({ balance, transactions }: { balance: number; transactions: WalletTx[] }) {
  return (
    <SectionCard title="Finances">
      <Card variant="flat" className="flex items-center gap-3 p-4">
        <span className="bg-primary/10 grid size-11 shrink-0 place-items-center rounded-xl">
          <CoinsIcon className="text-primary size-5.5" aria-hidden />
        </span>
        <div>
          <p className="text-muted-foreground text-xs">Coin balance</p>
          <p className="text-2xl font-semibold">
            <AnimatedNumber value={balance} />
          </p>
        </div>
      </Card>

      {transactions.length === 0 ? (
        <LottieEmptyState
          animation="coin-burst"
          title="No wallet activity yet"
          body="Earns and redemptions will appear here."
        />
      ) : (
        <div className="divide-y">
          {transactions.slice(0, 3).map((tx) => (
            <WalletTxRow key={tx.publicId} tx={tx} />
          ))}
        </div>
      )}

      <TransitionLink href="/me/wallet" className="text-primary block pt-3 text-sm font-medium">
        View finances →
      </TransitionLink>
    </SectionCard>
  );
}

// Named skeleton twin — a Server Component cannot dot into this "use client"
// module's export (the /dashboard/orders bug).
export function WalletSectionSkeleton() {
  return (
    <SectionCard title="Finances">
      <Skeleton className="h-20 w-full rounded-lg" />
      <div className="space-y-2 pt-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </SectionCard>
  );
}
