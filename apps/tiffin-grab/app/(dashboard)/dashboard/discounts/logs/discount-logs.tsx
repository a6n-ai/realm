import Link from "next/link";
import { HistoryIcon } from "lucide-react";
import { EmptyState } from "@/components/ds";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Single source of truth for the table's columns. The real header and the
// skeleton below both render from this, so the loading twin can never drift.
const COLUMNS = [
  { key: "time", label: "Time" },
  { key: "coupon", label: "Coupon" },
  { key: "user", label: "User" },
  { key: "amount", label: "Amount", align: "right" },
  { key: "order", label: "Order" },
  { key: "redeemedBy", label: "Redeemed by" },
] as const;

type Stat = { label: string; value: string };

type DiscountLogRow = {
  publicId: string;
  createdAt: number;
  amountApplied: string;
  code: string | null;
  email: string | null;
  redeemedByEmail: string | null;
  orderPublicId: string | null;
};

function fmt(ms: number): string {
  return new Date(ms).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

export function DiscountLogs({ stats, rows }: { stats: Stat[]; rows: DiscountLogRow[] }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border p-4">
            <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={HistoryIcon} message="No discounts redeemed yet. Coupon redemptions will appear here." />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((c) => (
                  <TableHead key={c.key} className={"align" in c ? "text-right" : undefined}>
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.publicId}>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{fmt(r.createdAt)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.code ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-ok">−${Number(r.amountApplied).toFixed(2)}</TableCell>
                  <TableCell>
                    {r.orderPublicId ? (
                      <Link href={`/dashboard/orders/${r.orderPublicId}`} className="text-muted-foreground hover:underline">
                        {r.orderPublicId}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.redeemedByEmail ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

// Exact loading twin: same stat-card grid + same COLUMNS-driven table markup,
// grey cells instead of data. Rendered as the page's <Suspense fallback>.
DiscountLogs.Skeleton = function DiscountLogsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="mt-2 h-3 w-20" />
          </div>
        ))}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) => (
                <TableHead key={c.key} className={"align" in c ? "text-right" : undefined}>
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
    </>
  );
};
