import { comingWeekStartIso, thisWeekStartIso } from "@/lib/menu/delivery-dates";
import { menuService } from "@/lib/services/menu.service";

export type BrowsePublishedWeek = Awaited<ReturnType<typeof menuService.getPublishedWeek>>;
export type WeekScope = "this" | "next";

/**
 * Customer Menu is a browse surface: show this week's released poster if it exists,
 * otherwise the coming week's — kitchen often publishes 21–27 Sep while today is still
 * the 20th. `want: "next"` picks the coming week when it is released; `scopes` lists
 * every released week so the page can offer a switch. Deliveries keep exact weekStart
 * matching; this helper is Menu-only and never falls back to a past week.
 */
export async function browsePublishedWeek(
  nowMs: number,
  timezone: string,
  want: WeekScope = "this",
): Promise<{ week: BrowsePublishedWeek; scope: WeekScope; scopes: WeekScope[] } | { week: null; scope: null; scopes: [] }> {
  const [thisWeek, coming] = await Promise.all([
    menuService.getPublishedWeek(thisWeekStartIso(nowMs, timezone)),
    menuService.getPublishedWeek(comingWeekStartIso(nowMs, timezone)),
  ]);
  const scopes: WeekScope[] = [...(thisWeek ? ["this" as const] : []), ...(coming ? ["next" as const] : [])];
  if (coming && (want === "next" || !thisWeek)) return { week: coming, scope: "next", scopes };
  if (thisWeek) return { week: thisWeek, scope: "this", scopes };
  return { week: null, scope: null, scopes: [] };
}
