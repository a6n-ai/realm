import { asc, inArray } from "drizzle-orm";
import { parseIsoDateUtc } from "@foundry/commons";
import type { db } from "@/db/client";
import { deliveryExtraTiffins, deliveryMoves } from "@/db/schema";

/** Eat dates of each trip's extra tiffins (one entry per extra, so a date can repeat). */
export async function loadExtraDates(exec: Pick<typeof db, "select">, deliveryIds: bigint[]): Promise<Map<bigint, string[]>> {
  const out = new Map<bigint, string[]>();
  if (deliveryIds.length === 0) return out;
  const rows = await exec.select({ deliveryId: deliveryExtraTiffins.deliveryId, eatDate: deliveryExtraTiffins.eatDate })
    .from(deliveryExtraTiffins).where(inArray(deliveryExtraTiffins.deliveryId, deliveryIds));
  for (const r of rows) (out.get(r.deliveryId) ?? out.set(r.deliveryId, []).get(r.deliveryId)!).push(r.eatDate);
  return out;
}

/** NULL from date = a pooled tiffin scheduled onto this trip; undefined = no move row found. */
export function extraTiffinLabel(fromEatDate: string | null | undefined): string {
  if (fromEatDate === undefined) return "Extra";
  if (fromEatDate === null) return "Extra · pool";
  // Sits after the customer name in the Excel/labels name cell, so kept short.
  const day = parseIsoDateUtc(fromEatDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `Extra · ${day}`;
}

type MoveIn = { toEatDate: string; fromEatDate: string | null };

/** Moves landing on each trip, oldest first — the order its extra tiffins were added in. */
export async function loadMovesIn(exec: Pick<typeof db, "select">, deliveryIds: bigint[]): Promise<Map<bigint, MoveIn[]>> {
  const out = new Map<bigint, MoveIn[]>();
  if (deliveryIds.length === 0) return out;
  const rows = await exec
    .select({ deliveryId: deliveryMoves.toDeliveryId, toEatDate: deliveryMoves.toEatDate, fromEatDate: deliveryMoves.fromEatDate })
    .from(deliveryMoves)
    .where(inArray(deliveryMoves.toDeliveryId, deliveryIds))
    .orderBy(asc(deliveryMoves.id));
  for (const m of rows) (out.get(m.deliveryId) ?? out.set(m.deliveryId, []).get(m.deliveryId)!).push(m);
  return out;
}

/** The tag for the nth tiffin (0-based) of one eating day on a trip; the first one is the regular tiffin. */
export function extraTiffinLabelAt(moves: MoveIn[] | undefined, forDate: string, nth: number): string | null {
  if (nth === 0) return null;
  return extraTiffinLabel((moves ?? []).filter((m) => m.toEatDate === forDate)[nth - 1]?.fromEatDate);
}
