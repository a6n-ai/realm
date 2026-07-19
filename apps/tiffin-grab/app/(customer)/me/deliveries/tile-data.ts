// Plain module: derives what a tiffin-tile actually renders from a CalendarCell — one dish
// thumbnail + name to stand in for "today's meal", since a tile shows the day's own food, not
// an abstract grid number. Kept separate from calendar-constants.ts because this is presentation
// derivation (which pick to show as the tile's face), not the CalendarCell shape itself.

import type { FileDetail } from "@realm/storage/model";
import type { CalendarCell } from "./calendar-constants";
import { calendarDayStatus, type DayStatus } from "./day-status";

export type TileData = {
  date: string;
  status: DayStatus;
  dishName: string | null;
  dishImage: FileDetail | null;
  diet: "veg" | "nonveg" | null;
  // Additional distinct picks beyond the primary one shown on the tile face (e.g. a second
  // category's dish, or a second unit of a selectable one) — rendered as a "+N" badge.
  extraCount: number;
};

export function cellToTileData(cell: CalendarCell): TileData {
  const status = calendarDayStatus(cell);
  const picks = (cell.meal ?? []).flatMap((c) => c.picks);
  const primary = picks[0];
  // The resolved pick doesn't carry diet/image (resolveDeliveryMeal only returns id/name) — the
  // day's own `options` list (menu items for that day) is the one place those live, so look the
  // primary pick's dish back up there by public id.
  const option = primary ? cell.options.find((o) => o.dishId === primary.dishPublicId) : undefined;
  return {
    date: cell.date,
    status,
    dishName: primary?.name ?? null,
    dishImage: option?.image ?? null,
    diet: option?.diet ?? null,
    extraCount: Math.max(picks.length - 1, 0),
  };
}
