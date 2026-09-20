import { comingWeekStartIso, thisWeekStartIso } from "@/lib/menu/delivery-dates";
import { menuService } from "@/lib/services/menu.service";

export type BrowsePublishedWeek = Awaited<ReturnType<typeof menuService.getPublishedWeek>>;

/**
 * Customer Menu is a browse surface: show this week's released poster if it exists,
 * otherwise the coming week's — kitchen often publishes 21–27 Sep while today is still
 * the 20th. Deliveries keep exact weekStart matching; this helper is Menu-only and
 * never falls back to a past week.
 */
export async function browsePublishedWeek(
  nowMs: number,
  timezone: string,
): Promise<{ week: BrowsePublishedWeek; scope: "this" | "next" } | { week: null; scope: null }> {
  const thisMonday = thisWeekStartIso(nowMs, timezone);
  const thisWeek = await menuService.getPublishedWeek(thisMonday);
  if (thisWeek) return { week: thisWeek, scope: "this" };
  const coming = await menuService.getPublishedWeek(comingWeekStartIso(nowMs, timezone));
  if (coming) return { week: coming, scope: "next" };
  return { week: null, scope: null };
}
