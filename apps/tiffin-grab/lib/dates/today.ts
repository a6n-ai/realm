import { todayInZone } from "@foundry/commons/util/dates";

/** Calendar day (YYYY-MM-DD) in the app timezone. Not appToday (start-date.ts), which rolls to tomorrow after the cutoff. */
export const appTodayIso = (timezone: string, now = Date.now()): string => todayInZone(timezone, now);
