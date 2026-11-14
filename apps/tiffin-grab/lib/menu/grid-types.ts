import type { FileDetail } from "@foundry/storage/model";
import type { DayOfWeek } from "./delivery-days";

export type GridCell = {
  day: DayOfWeek;
  dateIso: string;
  slot: string;
  personIndex: number;
  pickIndex: number;
  selectable: boolean;
  quantity: number;
  selectedDishId: string | null;
  isDefaulted: boolean;
  dishes: GridDish[];
  locked: boolean;
  lockNote?: string | null;
  /** A custom meal row whose category mixes diets ("Non-Veg"): its dishes are that diet's only. */
  diet?: string;
};

/** `ruleId`/`planId` are dishes.id / dishes.planId as strings — what meal rules test; absent means untestable. */
export type GridDish = { id: string; name: string; image: FileDetail | null; ruleId?: string; planId?: string };

/** Add-on rows are appended after every meal row: sortOrder at or above this marks one. */
export const ADDON_SORT_BASE = 100_000;
