import { zonedDateIso } from "@foundry/commons";
import { zonedDayStart } from "@/lib/analytics/drill";

const DAYS = { tomorrow: 1, "3d": 3, "1w": 7 } as const;
const TEN_AM = 10 * 60 * 60 * 1000;

// ponytail: midnight + 10h is an hour off on the two DST-change days; fine for a follow-up reminder.
export function followUpAtDate(isoDate: string, timeZone: string): number {
  return zonedDayStart(isoDate, timeZone) + TEN_AM;
}

export function followUpPick(kind: keyof typeof DAYS, now: number, timeZone: string): number {
  const [y, m, d] = zonedDateIso(now, timeZone).split("-").map(Number) as [number, number, number];
  const iso = new Date(Date.UTC(y, m - 1, d + DAYS[kind])).toISOString().slice(0, 10);
  return followUpAtDate(iso, timeZone);
}
