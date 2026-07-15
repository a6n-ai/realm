"use client";

import { Skeleton } from "@realm/ui/skeleton";
import { FacetFilters, ListPagination } from "@/components/ds";
import { Reveal, LottieEmptyState } from "@/components/motion";
import { eventLabel } from "@/components/notifications/template-status";
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
        <p className="truncate text-sm font-medium">{eventLabel(tx.eventType ?? tx.sourceType)}</p>
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
  items, page, size, total,
}: {
  items: WalletTx[];
  page: number;
  size: number;
  total: number;
}) {
  return (
    <div className="space-y-4">
      <FacetFilters spec={WALLET_FACETS} />
      {items.length === 0 ? (
        <LottieEmptyState
          animation="coin-burst"
          title="No wallet activity yet"
          body="Earns and redemptions will appear here."
        />
      ) : (
        <Reveal.Group className="divide-y">
          {items.map((tx) => (
            <WalletLogRow key={tx.publicId} tx={tx} />
          ))}
        </Reveal.Group>
      )}
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function WalletLogSkeleton() {
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
