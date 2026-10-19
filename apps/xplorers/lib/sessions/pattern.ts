import { addDayKey } from "./timezone";

export type RepeatPattern = {
  /** 1 = Mon .. 7 = Sun */
  weekdays: number[];
  nthOfMonth: number[] | null;
  startClock: string;
  endClock: string;
  startsOn: string;
  endsOn: string | null;
  excludeMonths: number[];
};

/** Local `YYYY-MM-DD` days in [from, to] (inclusive) that the pattern lands on. `nthOfMonth` is the 1st..5th such weekday of the month. */
export function expandPattern(p: RepeatPattern, from: string, to: string): string[] {
  const first = from > p.startsOn ? from : p.startsOn;
  const last = p.endsOn && p.endsOn < to ? p.endsOn : to;
  const out: string[] = [];
  for (let day = first; day <= last; day = addDayKey(day, 1)) {
    const date = new Date(`${day}T00:00:00Z`);
    const weekday = date.getUTCDay() || 7;
    if (!p.weekdays.includes(weekday)) continue;
    if (p.excludeMonths.includes(date.getUTCMonth() + 1)) continue;
    if (p.nthOfMonth && !p.nthOfMonth.includes(Math.ceil(date.getUTCDate() / 7))) continue;
    out.push(day);
  }
  return out;
}
