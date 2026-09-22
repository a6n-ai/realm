import { inArray } from "drizzle-orm";
import type { db } from "@/db/client";
import { deliveryExtraTiffins } from "@/db/schema";

/** Eat dates of each trip's extra tiffins (one entry per extra, so a date can repeat). */
export async function loadExtraDates(exec: Pick<typeof db, "select">, deliveryIds: bigint[]): Promise<Map<bigint, string[]>> {
  const out = new Map<bigint, string[]>();
  if (deliveryIds.length === 0) return out;
  const rows = await exec.select({ deliveryId: deliveryExtraTiffins.deliveryId, eatDate: deliveryExtraTiffins.eatDate })
    .from(deliveryExtraTiffins).where(inArray(deliveryExtraTiffins.deliveryId, deliveryIds));
  for (const r of rows) (out.get(r.deliveryId) ?? out.set(r.deliveryId, []).get(r.deliveryId)!).push(r.eatDate);
  return out;
}
