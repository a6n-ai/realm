import { and, eq, lt } from "drizzle-orm";
import { drizzleReviewNudgeStore } from "@foundry/google-reviews/db";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";
import { appTodayIso } from "@/lib/dates/today";
import { getAppSettings } from "@/lib/settings";

export const reviewNudgeStore = drizzleReviewNudgeStore(db);

/** Only customers who have actually eaten with us get asked: one past, still-scheduled delivery. */
export async function hasHadATiffin(userId: bigint): Promise<boolean> {
  const today = appTodayIso((await getAppSettings()).timezone);
  const [row] = await db
    .select({ id: deliveries.id })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .where(and(eq(orders.userId, userId), eq(deliveries.status, "scheduled"), lt(deliveries.deliveryDate, today)))
    .limit(1);
  return Boolean(row);
}
