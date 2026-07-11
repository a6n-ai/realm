import { parseIsoDateUtc, zonedDateIso } from "@realm/commons";

// The [from, until] calendar-date window (inclusive) for "this month" in the
// app timezone, not the server's. Derived from zonedDateIso, so a delivery
// stamped just past local midnight in a positive-offset zone (e.g. Asia/Kolkata)
// already counts as next month even while the server's UTC clock is still on
// the previous day.
export function monthWindow(nowMs: number, timezone: string): { from: string; until: string } {
  const today = zonedDateIso(nowMs, timezone);
  const from = `${today.slice(0, 7)}-01`;
  const untilDate = parseIsoDateUtc(from);
  untilDate.setUTCMonth(untilDate.getUTCMonth() + 1);
  untilDate.setUTCDate(untilDate.getUTCDate() - 1); // last day of this month
  const until = untilDate.toISOString().slice(0, 10);
  return { from, until };
}
