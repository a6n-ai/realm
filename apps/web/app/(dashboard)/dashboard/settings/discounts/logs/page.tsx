import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { HistoryIcon } from "lucide-react";
import { db } from "@/db/client";
import { couponRedemptions, coupons, users, orders } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { EmptyState } from "@/components/ds";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const customer = alias(users, "customer");
const redeemer = alias(users, "redeemer");

function fmt(ms: number): string {
  return new Date(ms).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

export default async function DiscountLogsPage() {
  await requireAdmin();

  const [[agg], rows] = await Promise.all([
    db
      .select({
        redemptions: sql<number>`cast(count(*) as int)`,
        discounted: sql<string>`coalesce(sum(${couponRedemptions.amountApplied}), 0)`,
        coupons: sql<number>`cast(count(distinct ${couponRedemptions.couponId}) as int)`,
        customers: sql<number>`cast(count(distinct ${couponRedemptions.userId}) as int)`,
      })
      .from(couponRedemptions),
    db
    .select({
      publicId: couponRedemptions.publicId,
      createdAt: couponRedemptions.createdAt,
      amountApplied: couponRedemptions.amountApplied,
      code: coupons.code,
      email: customer.email,
      redeemedByEmail: redeemer.email,
      orderPublicId: orders.publicId,
    })
    .from(couponRedemptions)
    .leftJoin(coupons, eq(coupons.id, couponRedemptions.couponId))
    .leftJoin(customer, eq(customer.id, couponRedemptions.userId))
    .leftJoin(redeemer, eq(redeemer.id, couponRedemptions.redeemedBy))
    .leftJoin(orders, eq(orders.id, couponRedemptions.orderId))
    .orderBy(desc(couponRedemptions.createdAt))
    .limit(100),
  ]);

  const stats = [
    { label: "Redemptions", value: agg.redemptions.toLocaleString() },
    { label: "Total discounted", value: `$${Number(agg.discounted).toFixed(2)}` },
    { label: "Coupons used", value: agg.coupons.toLocaleString() },
    { label: "Customers", value: agg.customers.toLocaleString() },
  ];

  return (
    <div className="space-y-6">
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
            <TableHead>Time</TableHead>
            <TableHead>Coupon</TableHead>
            <TableHead>User</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Redeemed by</TableHead>
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
    </div>
  );
}
