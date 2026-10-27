"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Coins } from "lucide-react";
import { EmptyState, ListGroup, ListRow, buttonClass } from "@/components/customer/kit";
import { eventLabel } from "@relay/engine/ui/template-status";
import { walletEntryLabel } from "@/lib/wallet/source-labels";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { WalletTx } from "@/lib/services/wallet.service";
import { WALLET_FACETS } from "./wallet-facets";
import { FilterBar, GroupHeader, QuietPagination, groupByMonth } from "./finance-kit";
import { FilterBarSkeleton, MonthGroupSkeleton, StatGroupSkeleton } from "@/components/customer/skeleton-parts";

function WalletLogRow({ tx }: { tx: WalletTx }) {
  const tz = useTimezone();
  const credit = tx.direction === "credit";
  return (
    <ListRow
      tint={credit ? "green" : "orange"}
      icon={credit ? <ArrowDownLeft /> : <ArrowUpRight />}
      label={walletEntryLabel(tx.sourceType, tx.eventType ? eventLabel(tx.eventType) : null)}
      sublabel={formatEpoch(tx.createdAt, { mode: "datetime", timeZone: tz })}
      value={
        <span className={credit ? "text-ok" : "text-[var(--foreground)]"}>
          {credit ? "+" : "−"}
          {tx.coins}
        </span>
      }
    />
  );
}

export function WalletLog({
  items, page, size, total, filtered = false,
}: {
  items: WalletTx[];
  page: number;
  size: number;
  total: number;
  filtered?: boolean;
}) {
  const tz = useTimezone();
  return (
    <div className="flex flex-col gap-4">
      {/* Stays while a filter is on, so an empty filtered result can still be cleared. */}
      {(total > 0 || filtered) && <FilterBar spec={WALLET_FACETS} />}
      {items.length === 0 ? (
        <EmptyState
          icon={<Coins className="size-6" />}
          title="No wallet activity yet"
          body="Earns and redemptions will appear here."
          action={<Link href="/me/refer" className={buttonClass({ variant: "outline" })}>Refer a friend</Link>}
        />
      ) : (
        groupByMonth(items, (tx) => tx.createdAt, tz).map((g) => (
          <section key={g.key} aria-label={g.label}>
            <GroupHeader>{g.label}</GroupHeader>
            <ListGroup>
              {g.items.map((tx) => (
                <WalletLogRow key={tx.publicId} tx={tx} />
              ))}
            </ListGroup>
          </section>
        ))
      )}
      {total > 0 && <QuietPagination page={page} size={size} total={total} />}
    </div>
  );
}

function WalletLogSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <FilterBarSkeleton />
      <MonthGroupSkeleton />
    </div>
  );
}

/** The coins tab: WalletHero card above the ledger. */
export function CoinsPanelSkeleton() {
  return (
    <div className="space-y-4">
      <StatGroupSkeleton cells={3} hint={false} />
      <WalletLogSkeleton />
    </div>
  );
}
