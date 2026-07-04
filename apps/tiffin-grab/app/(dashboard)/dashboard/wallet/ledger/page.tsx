import { Suspense } from "react";
import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { ScrollTextIcon } from "lucide-react";
import { db } from "@/db/client";
import { walletLedger, users, orders } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { eventLabel } from "@/components/notifications/template-status";
import { EmptyState, SkeletonStatCards } from "@/components/ds";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@realm/ui/table";
import { Skeleton } from "@realm/ui/skeleton";
import { cn } from "@realm/ui/cn";

// Single source of truth for the ledger table's columns. The real header and
// the skeleton twin both render from this, so the loading state can't drift.
const COLUMNS = [
  { key: "time", label: "Time" },
  { key: "user", label: "User" },
  { key: "event", label: "Event" },
  { key: "source", label: "Source" },
  { key: "coins", label: "Coins", align: "right" },
  { key: "order", label: "Order" },
  { key: "memo", label: "Memo" },
] as const;

function fmt(ms: number): string {
  return new Date(ms).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

export default function WalletLedgerPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={5} />}>
        <WalletStatsData />
      </Suspense>

      <Suspense fallback={<WalletLedgerData.Skeleton />}>
        <WalletLedgerData />
      </Suspense>
    </div>
  );
}

async function WalletStatsData() {
  await requireAdmin();

  const coinsIf = (dir: "credit" | "debit") =>
    sql<number>`cast(coalesce(sum(case when ${walletLedger.direction} = ${dir} then ${walletLedger.coins} else 0 end), 0) as int)`;

  const [agg] = await db
    .select({
      credited: coinsIf("credit"),
      redeemed: coinsIf("debit"),
      entries: sql<number>`cast(count(*) as int)`,
      wallets: sql<number>`cast(count(distinct ${walletLedger.userId}) as int)`,
    })
    .from(walletLedger);

  const stats = [
    { label: "Coins credited", value: agg.credited.toLocaleString() },
    { label: "Coins redeemed", value: agg.redeemed.toLocaleString() },
    { label: "Net outstanding", value: (agg.credited - agg.redeemed).toLocaleString() },
    { label: "Active wallets", value: agg.wallets.toLocaleString() },
    { label: "Entries", value: agg.entries.toLocaleString() },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border p-4">
          <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

async function WalletLedgerData() {
  await requireAdmin();

  const rows = await db
    .select({
      publicId: walletLedger.publicId,
      createdAt: walletLedger.createdAt,
      direction: walletLedger.direction,
      eventType: walletLedger.eventType,
      sourceType: walletLedger.sourceType,
      coins: walletLedger.coins,
      memo: walletLedger.memo,
      email: users.email,
      orderPublicId: orders.publicId,
    })
    .from(walletLedger)
    .leftJoin(users, eq(users.id, walletLedger.userId))
    .leftJoin(orders, eq(orders.id, walletLedger.orderId))
    .orderBy(desc(walletLedger.createdAt))
    .limit(100);

  if (rows.length === 0) {
    return <EmptyState icon={ScrollTextIcon} message="No wallet activity yet. Earns and redemptions will appear here." />;
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead key={c.key} className={cn("align" in c && "text-right")}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const credit = r.direction === "credit";
            return (
              <TableRow key={r.publicId}>
                <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{fmt(r.createdAt)}</TableCell>
                <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
                <TableCell>{r.eventType ? eventLabel(r.eventType) : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{r.sourceType}</TableCell>
                <TableCell className={`text-right tabular-nums ${credit ? "text-ok" : "text-bad"}`}>
                  {credit ? "+" : "−"}
                  {r.coins}
                </TableCell>
                <TableCell>
                  {r.orderPublicId ? (
                    <Link href={`/dashboard/orders/${r.orderPublicId}`} className="text-muted-foreground hover:underline">
                      {r.orderPublicId}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">{r.memo ?? ""}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// Exact loading twin: same COLUMNS + same bordered Table markup, grey cells
// instead of data. Rendered as the page's <Suspense fallback>, so it always
// matches WalletLedgerData by construction.
WalletLedgerData.Skeleton = function WalletLedgerSkeleton() {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead key={c.key} className={cn("align" in c && "text-right")}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, r) => (
            <TableRow key={r}>
              {COLUMNS.map((c) => (
                <TableCell key={c.key} className={"align" in c ? "text-right" : undefined}>
                  <Skeleton className={cn("h-4 w-full max-w-32", "align" in c && "ml-auto")} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
