"use client";
import Link from "next/link";
import { ArrowUpRightIcon, CheckCircle2Icon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { SectionCard } from "@/components/ds";
import { Badge } from "@/components/reui/badge";
import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { Skeleton } from "@foundry/ui/skeleton";
import { ALL_OWNERS, ME } from "@/lib/list/presets";
import type { NextOrderReason, NextOrderRow } from "@/lib/services/next-order.service";
import { ContactChips } from "@/components/dashboard/next-item/contact-chips";
import { NextOrderActions } from "./next-order-actions";

const DAY_MS = 86_400_000;

export type OwnerChoice = { value: string; label: string; href: string };

export type NextOrderCardProps = {
  row: NextOrderRow | null;
  currency: string;
  now: number;
  queueCount: number;
  owner: { current: string; options: OwnerChoice[] };
  prevHref?: string;
  nextHref?: string;
  upNext: NextOrderRow[];
  attentionHref: string;
};

function initials(name: string): string {
  return name.replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "#";
}

/** Badge text: payment reasons say how long the payment has been open, in days. */
export function reasonBadge(reason: NextOrderReason, signalAt: number, now: number, amount: number | null, currency: string) {
  const days = Math.max(0, Math.floor((now - signalAt) / DAY_MS));
  const money = amount == null ? "" : ` · ${formatMoney(amount, currency)}`;
  switch (reason) {
    case "verify":
      return <Badge variant="warning-light">Payment to verify{money}</Badge>;
    case "overdue":
      return <Badge variant="destructive-light">Payment overdue · {days}d{money}</Badge>;
    case "missed":
      return <Badge variant="destructive-light">Missed deliveries</Badge>;
    case "flagged":
      return <Badge variant="secondary">Flagged</Badge>;
    case "pending":
      return <Badge variant="outline">Payment pending{money}</Badge>;
  }
}

function UpNextStrip({ rows, currency, now }: { rows: NextOrderRow[]; currency: string; now: number }) {
  return (
    <section aria-label="Up next orders" className="mt-3 border-t pt-3">
      <div tabIndex={0} className="focus-visible:ring-ring flex snap-x gap-3 overflow-x-auto pb-2 focus-visible:outline-none focus-visible:ring-2">
        {rows.slice(0, 6).map((row) => (
          <div key={row.publicId} className="flex w-64 shrink-0 snap-start flex-col gap-2 rounded-lg border p-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Link href={`/dashboard/orders/${row.publicId}`} className="truncate text-sm font-medium hover:underline">
                {row.customerName}
              </Link>
              <span className="text-muted-foreground truncate text-xs">{row.code}</span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">{reasonBadge(row.reason, row.signalAt, now, row.amount, currency)}</div>
            <NextOrderActions row={row} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function NextOrderCard({ row, currency, now, queueCount, owner, prevHref, nextHref, upNext, attentionHref }: NextOrderCardProps) {
  const ownerLabel = owner.options.find((o) => o.value === owner.current)?.label ?? "Me";
  const picker = (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">{owner.current === ME ? "Your queue" : owner.current === ALL_OWNERS ? "All owners" : `${ownerLabel}'s queue`}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            {ownerLabel}
            <ChevronDownIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {owner.options.map((o) => (
            <DropdownMenuItem key={o.value} asChild>
              <Link href={o.href}>{o.label}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
  return (
    <SectionCard title="Next order" subtitle={`${queueCount} to act on`} action={picker}>
      {row ? (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-medium">{initials(row.customerName)}</div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link href={`/dashboard/orders/${row.publicId}`} className="truncate font-medium hover:underline">
                  {row.customerName}
                </Link>
                <p className="text-muted-foreground truncate text-xs">{[row.code, `${row.planName} · ${row.mealSizeName}`].join(" · ")}</p>
                <ContactChips name={row.customerName} phone={row.phone} />
              </div>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 md:w-64">{reasonBadge(row.reason, row.signalAt, now, row.amount, currency)}</div>
            <div className="flex flex-wrap items-center gap-2">
              <NextOrderActions row={row} />
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/dashboard/orders/${row.publicId}`}>
                  <ArrowUpRightIcon className="size-4" />
                  Open order
                </Link>
              </Button>
              <div className="flex items-center gap-1">
                {prevHref ? (
                  <Button variant="ghost" size="icon-sm" aria-label="Previous order" asChild>
                    <Link href={prevHref} prefetch={false}>
                      <ChevronLeftIcon className="size-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon-sm" aria-label="Previous order" disabled>
                    <ChevronLeftIcon className="size-4" />
                  </Button>
                )}
                {nextHref ? (
                  <Button variant="ghost" size="icon-sm" aria-label="Next order" asChild>
                    <Link href={nextHref} prefetch={false}>
                      <ChevronRightIcon className="size-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon-sm" aria-label="Next order" disabled>
                    <ChevronRightIcon className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          {upNext.length > 0 ? <UpNextStrip rows={upNext} currency={currency} now={now} /> : null}
        </>
      ) : (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
              <CheckCircle2Icon className="text-muted-foreground size-5" />
            </div>
            <p className="text-sm font-medium">No orders need attention.</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={attentionHref} prefetch={false}>Waiting on payment</Link>
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

export function NextOrderSkeleton() {
  return (
    <SectionCard title="Next order" action={<Skeleton className="h-8 w-40" />}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <div className="flex flex-1 items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <Skeleton className="h-5 w-40 md:w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
      <div className="mt-3 flex gap-3 border-t pt-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-64 shrink-0 rounded-lg" />
        ))}
      </div>
    </SectionCard>
  );
}
