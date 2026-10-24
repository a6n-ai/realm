"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { EmptyState, Skeleton, buttonClass } from "@/components/customer/kit";
import { ListPagination } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { Reveal } from "@/components/motion";
import { eventLabel } from "@relay/engine/ui/template-status";
import { walletEntryLabel } from "@/lib/wallet/source-labels";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { WalletTx } from "@/lib/services/wallet.service";
import { WALLET_FACETS } from "./wallet-facets";

function WalletLogRow({ tx }: { tx: WalletTx }) {
  const tz = useTimezone();
  const credit = tx.direction === "credit";
  return (
    <Reveal className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{walletEntryLabel(tx.sourceType, tx.eventType ? eventLabel(tx.eventType) : null)}</p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {formatEpoch(tx.createdAt, { mode: "datetime", timeZone: tz })}
        </p>
      </div>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${credit ? "text-ok" : "text-bad"}`}>
        {credit ? "+" : "−"}
        {tx.coins}
      </span>
    </Reveal>
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
  return (
    <div className="space-y-4">
      {/* Stays while a filter is on, so an empty filtered result can still be cleared. */}
      {(total > 0 || filtered) && <ReuiFacetFilters spec={WALLET_FACETS} />}
      {items.length === 0 ? (
        <EmptyState
          icon={<Coins className="size-6" />}
          title="No wallet activity yet"
          body="Earns and redemptions will appear here."
          action={<Link href="/me/refer" className={buttonClass({ variant: "outline" })}>Refer a friend</Link>}
        />
      ) : (
        <Reveal.Group className="divide-y">
          {items.map((tx) => (
            <WalletLogRow key={tx.publicId} tx={tx} />
          ))}
        </Reveal.Group>
      )}
      {total > 0 && <ListPagination page={page} size={size} total={total} />}
    </div>
  );
}

function WalletLogSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </div>
  );
}

/** The coins tab: WalletHero card above the ledger. */
export function CoinsPanelSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 md:h-[120px]" />
      <WalletLogSkeleton />
    </div>
  );
}
