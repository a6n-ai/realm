import type { ClassPricing, DayType, PriceTable } from "./types";

const GRID_MS = 30 * 60_000;

// Derived from the string so it does not depend on the machine timezone.
export function dayTypeOf(occursOn: string): DayType {
  const dow = new Date(`${occursOn}T00:00:00Z`).getUTCDay();
  return dow === 5 || dow === 6 || dow === 0 ? "weekend" : "weekday";
}

/** First layer holding a number for this key and day wins; order is session, class, global. */
export function resolveCell(
  key: string,
  day: DayType,
  layers: (PriceTable | null | undefined)[],
): number | null {
  for (const layer of layers) {
    const v = layer?.[key]?.[day];
    if (typeof v === "number") return v;
  }
  return null;
}

export function offeredLengths(pricing: ClassPricing, globalTable: PriceTable, windowMinutes: number): number[] {
  const all =
    pricing.mode === "options"
      ? pricing.options.map((o) => o.lengthMinutes)
      : Object.keys(globalTable)
          .filter((k) => k.startsWith("len:"))
          .map((k) => Number(k.slice(4)))
          .filter((m) => m >= pricing.defaultLengthMinutes);
  return [...new Set(all)].filter((m) => m <= windowMinutes).sort((a, b) => a - b);
}

export function startTimes(windowStart: Date, windowEnd: Date, minMinutes: number): Date[] {
  const out: Date[] = [];
  for (
    let t = windowStart.getTime();
    t + minMinutes * 60_000 <= windowEnd.getTime();
    t += GRID_MS
  ) {
    out.push(new Date(t));
  }
  return out;
}
