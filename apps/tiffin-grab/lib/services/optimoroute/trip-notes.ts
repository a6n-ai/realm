import { asc, inArray } from "drizzle-orm";
import { parseIsoDateUtc } from "@foundry/commons";
import { db } from "@/db/client";
import { deliveryCategorySwaps } from "@/db/schema";
import { coveredDates } from "@/lib/menu/coverage";
import { loadExtraDates } from "@/lib/services/delivery-extras";
import { resolveTripDay, swapsForDay, weekLoader } from "@/lib/menu/trip-meals";
import type { DayDeliveryRow } from "@/lib/services/daily-labels.service";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayName = (iso: string) => DAY_NAMES[parseIsoDateUtc(iso).getUTCDay()]!;

export type TripDetail = {
  covered: string[];
  units: number;
  /** Tiffins beyond one per person: what makes the stop take longer at the door. */
  extraTiffins: number;
  /** "Covers Mon + Tue · 2 tiffins"; null on a plain single-day stop. */
  coverage: string | null;
  /** One "Tue: Dal, Rice" line per covered day; null unless the trip carries several days. */
  dishLines: string[];
};

/** Coverage is worth telling the driver whenever the stop is more than one tiffin per person.
 * `doubledDates` calls out a day carrying a moved-in tiffin on top of its own — e.g. "(Fri x2)" —
 * since "5 tiffins" alone hides that one box needs double the portion for that day. */
export function coverageLine(covered: string[], units: number, doubledDates: readonly string[] = []): string {
  const days = covered.length > 1 ? `Covers ${covered.map(dayName).join(" + ")} · ` : "";
  const counts = new Map<string, number>();
  for (const d of doubledDates) counts.set(d, (counts.get(d) ?? 0) + 1);
  const flags = [...counts.entries()].map(([date, extra]) => `${dayName(date)} x${extra + 1}`);
  const flag = flags.length ? ` (${flags.join(", ")})` : "";
  return `${days}${units} tiffin${units === 1 ? "" : "s"}${flag}`;
}

export function tripDetail(row: DayDeliveryRow, extraDates: readonly string[] = []): Omit<TripDetail, "dishLines"> {
  const covered = coveredDates(row.delivery);
  const units = row.delivery.tiffinUnits;
  const extraTiffins = Math.max(0, units - row.order.persons);
  return { covered, units, extraTiffins, coverage: covered.length > 1 || extraTiffins > 0 ? coverageLine(covered, units, extraDates) : null };
}

/** Per-day dishes cost a menu resolution per day, so only multi-day trips pay for them. */
export async function loadTripDetails(rows: DayDeliveryRow[]): Promise<Map<bigint, TripDetail>> {
  const out = new Map<bigint, TripDetail>();
  const extrasById = await loadExtraDates(db, rows.map((r) => r.delivery.id));
  const multi = rows.filter((r) => coveredDates(r.delivery).length > 1);
  const swaps = multi.length === 0
    ? []
    : await db
        .select({ deliveryId: deliveryCategorySwaps.deliveryId, forDate: deliveryCategorySwaps.forDate, fromCategory: deliveryCategorySwaps.fromCategory, toCategory: deliveryCategorySwaps.toCategory, qtyFrom: deliveryCategorySwaps.qtyFrom, qtyTo: deliveryCategorySwaps.qtyTo, fromRow: deliveryCategorySwaps.fromRow })
        .from(deliveryCategorySwaps)
        .where(inArray(deliveryCategorySwaps.deliveryId, multi.map((r) => r.delivery.id)))
        .orderBy(asc(deliveryCategorySwaps.id));
  const loadWeek = weekLoader();

  for (const row of rows) {
    const extraDates = extrasById.get(row.delivery.id) ?? [];
    const base = tripDetail(row, extraDates);
    const dishLines: string[] = [];
    if (base.covered.length > 1) {
      for (const date of base.covered) {
        const week = await loadWeek(date);
        if (!week) continue;
        // Person 1 stands for the order: a stop note is a heads-up, the labels carry every person's pick.
        const resolved = await resolveTripDay(row.order, week, date, 1, swapsForDay(swaps, row.delivery, date));
        const names = resolved.flatMap((c) => c.picks.map((p) => p.name));
        const extraCount = extraDates.filter((d) => d === date).length;
        const suffix = extraCount > 0 ? ` x${extraCount + 1}` : "";
        if (names.length) dishLines.push(`${dayName(date)}${suffix}: ${names.join(", ")}`);
      }
    }
    out.set(row.delivery.id, { ...base, dishLines });
  }
  return out;
}
