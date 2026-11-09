import { and, countDistinct, eq, inArray, lt, sql, sum } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";

export type KitchenCounts = { tiffins: number; households: number };

/** Tiffins already delivered and households that have had a plan, for the About page. Null when the database
 *  is out of reach (the CI build has none): the page then leaves the figures out rather than guess them. */
export async function loadKitchenCounts(): Promise<KitchenCounts | null> {
  try {
    const [[d], [o]] = await Promise.all([
      db.select({ tiffins: sum(deliveries.tiffinUnits) }).from(deliveries).where(and(eq(deliveries.status, "scheduled"), lt(deliveries.deliveryDate, sql`current_date`))),
      db.select({ households: countDistinct(orders.userId) }).from(orders).where(inArray(orders.status, ["active", "paused", "completed"])),
    ]);
    return { tiffins: Number(d?.tiffins ?? 0), households: Number(o?.households ?? 0) };
  } catch {
    return null;
  }
}

/** 4,789 -> "4,700+", 385 -> "380+", 42 -> "42": a figure that stays true between refreshes and ignores a few test accounts. */
export function roundedCount(n: number): string {
  if (n < 100) return String(n);
  const step = n < 1000 ? 10 : 100;
  return `${(Math.floor(n / step) * step).toLocaleString("en-CA")}+`;
}
