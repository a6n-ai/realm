import type { PriceTable } from "./types";

export const DEFAULT_PRICE_TABLE: PriceTable = {
  "len:90": { weekday: 68, weekend: 78 },
  "len:120": { weekday: 88, weekend: 98 },
  "len:180": { weekday: 128, weekend: 138 },
  "len:240": { weekday: 158, weekend: 168 },
  "len:300": { weekday: 178, weekend: 188 },
};
