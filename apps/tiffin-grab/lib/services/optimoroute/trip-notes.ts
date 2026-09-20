import { asc, inArray } from "drizzle-orm";
import { parseIsoDateUtc } from "@foundry/commons";
import { db } from "@/db/client";
import { deliveryCategorySwaps } from "@/db/schema";
import { coveredDates } from "@/lib/menu/coverage";
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

/** Coverage is worth telling the driver whenever the stop is more than one tiffin per person. */
export function coverageLine(covered: string[], units: number): string {
  const days = covered.length > 1 ? `Covers ${covered.map(dayName).join(" + ")} · ` : "";
  return `${days}${units} tiffin${units === 1 ? "" : "s"}`;
}

export function tripDetail(row: DayDeliveryRow): Omit<TripDetail, "dishLines"> {
  const covered = coveredDates(row.delivery);
  const units = row.delivery.tiffinUnits;
  const extraTiffins = Math.max(0, units - row.order.persons);
  return { covered, units, extraTiffins, coverage: covered.length > 1 || extraTiffins > 0 ? coverageLine(covered, units) : null };
}

/** Per-day dishes cost a menu resolution per day, so only multi-day trips pay for them. */
export async function loadTripDetails(rows: DayDeliveryRow[]): Promise<Map<bigint, TripDetail>> {
  const out = new Map<bigint, TripDetail>();
  const multi = rows.filter((r) => coveredDates(r.delivery).length > 1);
  const swaps = multi.length === 0
    ? []
    : await db
        .select({ deliveryId: deliveryCategorySwaps.deliveryId, forDate: deliveryCategorySwaps.forDate, fromCategory: deliveryCategorySwaps.fromCategory, toCategory: deliveryCategorySwaps.toCategory, qtyFrom: deliveryCategorySwaps.qtyFrom, qtyTo: deliveryCategorySwaps.qtyTo })
        .from(deliveryCategorySwaps)
        .where(inArray(deliveryCategorySwaps.deliveryId, multi.map((r) => r.delivery.id)))
        .orderBy(asc(deliveryCategorySwaps.id));
  const loadWeek = weekLoader();

  for (const row of rows) {
    const base = tripDetail(row);
    const dishLines: string[] = [];
    if (base.covered.length > 1) {
      for (const date of base.covered) {
        const week = await loadWeek(date);
        if (!week) continue;
        // Person 1 stands for the order: a stop note is a heads-up, the labels carry every person's pick.
        const resolved = await resolveTripDay(row.order, week, date, 1, swapsForDay(swaps, row.delivery, date));
        const names = resolved.flatMap((c) => c.picks.map((p) => p.name));
        if (names.length) dishLines.push(`${dayName(date)}: ${names.join(", ")}`);
      }
    }
    out.set(row.delivery.id, { ...base, dishLines });
  }
  return out;
}
