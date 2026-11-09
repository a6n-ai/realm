import { parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import { addDaysIso } from "@foundry/commons/util/dates";
import { WEEK_DAYS } from "@/db/schema/enums";

/** The dates after `after` whose weekday is in `days`, in order, scanning at most `maxCalendarDays` calendar days. */
export function* planDaysAfter(after: string, days: ReadonlySet<string>, maxCalendarDays = Infinity): Generator<string> {
  if (!WEEK_DAYS.some((d) => days.has(d))) return;
  let date = after;
  for (let i = 0; i < maxCalendarDays; i++) {
    date = addDaysIso(date, 1);
    if (days.has(weekdayKey(parseIsoDateUtc(date)))) yield date;
  }
}

type Search = {
  days: ReadonlySet<string>;
  skip?: (date: string) => boolean | Promise<boolean>;
  maxCalendarDays?: number;
  maxPlanDays?: number;
};

/**
 * The first `count` plan days after `after` that `skip` does not reject (a holiday, a taken or closed day, another
 * plan's day), plus the last plan day tried. Each caller keeps its own search limit: `maxCalendarDays` caps the days
 * scanned, `maxPlanDays` the plan days tried (taken ones included).
 */
export async function openPlanDays(after: string, count: number, o: Search): Promise<{ found: string[]; last: string | null }> {
  const found: string[] = [];
  let tried = 0;
  let last: string | null = null;
  for (const date of planDaysAfter(after, o.days, o.maxCalendarDays)) {
    if (found.length >= count || tried++ >= (o.maxPlanDays ?? Infinity)) break;
    last = date;
    if (!(await o.skip?.(date))) found.push(date);
  }
  return { found, last };
}

/** The first open plan day after `after`; null past the search limit, or with `exhausted: "last"` the last plan day tried. */
export async function nextOpenPlanDay(after: string, o: Search & { exhausted?: "null" | "last" }): Promise<string | null> {
  const { found, last } = await openPlanDays(after, 1, o);
  return found[0] ?? (o.exhausted === "last" ? last : null);
}
