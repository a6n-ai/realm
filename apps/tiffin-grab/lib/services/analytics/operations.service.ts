import { eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries } from "@/db/schema";

const intCount = sql<number>`cast(count(*) as int)`;

export type OperationsStats = {
  totalDeliveries: number;
  skipped: number;
  cancelled: number;
  skipRatePct: number;
};

export async function getOperationsStats(): Promise<OperationsStats> {
  const [[{ n: totalDeliveries }], [{ n: skipped }], [{ n: cancelled }]] = await Promise.all([
    db.select({ n: intCount }).from(deliveries),
    db.select({ n: intCount }).from(deliveries).where(eq(deliveries.status, "skipped")),
    db.select({ n: intCount }).from(deliveries).where(eq(deliveries.status, "cancelled")),
  ]);
  return {
    totalDeliveries,
    skipped,
    cancelled,
    skipRatePct: totalDeliveries > 0 ? Math.round((skipped / totalDeliveries) * 1000) / 10 : 0,
  };
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  paused: "Paused",
  skipped: "Skipped",
  cancelled: "Cancelled",
};

export async function getDeliveryStatusMix() {
  const rows = await db.select({ status: deliveries.status, n: intCount }).from(deliveries).groupBy(deliveries.status);
  return rows.map((r) => ({ status: STATUS_LABELS[r.status] ?? r.status, n: r.n }));
}

export async function getRouteLoadByDriver(limit = 10) {
  const rows = await db
    .select({ driver: deliveries.routeDriverName, n: intCount })
    .from(deliveries)
    .where(isNotNull(deliveries.routeDriverName))
    .groupBy(deliveries.routeDriverName)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
  return rows.map((r) => ({ driver: r.driver ?? "Unassigned", n: r.n }));
}
