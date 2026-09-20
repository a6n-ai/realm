// Per-covered-day meal resolution for a trip. resolveDeliveryMeal loads swaps by deliveryId
// alone (ignores for_date), so a carried day would inherit its sibling's swaps. We fold only
// the swaps that belong to the day into categoryCounts and pass deliveryId null instead.
import { weekdayKey, parseIsoDateUtc } from "@foundry/commons";
import { menuService } from "@/lib/services/menu.service";
import { mondayOfIso, type DayOfWeek } from "@/lib/menu/delivery-dates";
import { resolveDeliveryMeal, type ResolvedCategory } from "@/lib/menu/resolve-delivery-meal";
import { applySwapsToCounts, type SwapRow } from "@/lib/menu/swap-rules";

/** Swaps of one trip that apply to one eating day; NULL for_date means the trip's own date. */
export function swapsForDay<T extends { deliveryId: bigint; forDate: string | null }>(
  swaps: T[],
  delivery: { id: bigint; deliveryDate: string },
  date: string,
): T[] {
  return swaps.filter((s) => s.deliveryId === delivery.id && (s.forDate ?? delivery.deliveryDate) === date);
}

type Order = { id: bigint; planId: bigint; mealSizeId: bigint; categoryCounts: Record<string, number> | null };

export function weekLoader() {
  const cache = new Map<string, ReturnType<typeof menuService.getReleasedWeek>>();
  return (dateIso: string) => {
    const ws = mondayOfIso(dateIso);
    if (!cache.has(ws)) cache.set(ws, menuService.getReleasedWeek(ws));
    return cache.get(ws)!;
  };
}

export async function resolveTripDay(
  order: Order,
  week: { id: bigint; weekStart: string },
  dateIso: string,
  person: number,
  daySwaps: SwapRow[],
): Promise<ResolvedCategory[]> {
  const day = weekdayKey(parseIsoDateUtc(dateIso)) as DayOfWeek;
  return resolveDeliveryMeal(
    { id: order.id, planId: order.planId, mealSizeId: order.mealSizeId, categoryCounts: applySwapsToCounts(order.categoryCounts ?? {}, daySwaps) },
    week,
    day,
    person,
    null,
  );
}
