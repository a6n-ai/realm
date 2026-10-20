import { cutoffMsFor, parseIsoDateUtc, zonedDateIso } from "@foundry/commons";
import { earliestPlanStart, firstStartOnOrAfter, validateStartDate } from "@/lib/services/start-date";
import { assertTrialStart, earliestTrialIso } from "@/lib/trial/schedule";

/**
 * The start for a Stripe order that was paid after it was placed: the date the customer
 * chose while it is still bookable, else the first bookable allowed day (holidays skipped).
 */
export function paidStartDate(i: {
  chosen: string;
  allowedStartDays: string[];
  trialSendDays: string[] | null;
  todayBase: Date;
  closed: Set<string>;
}): string {
  try {
    if (i.trialSendDays) assertTrialStart(i.chosen, i.trialSendDays, i.todayBase);
    else validateStartDate(i.chosen, i.allowedStartDays, i.todayBase);
    if (!i.closed.has(i.chosen)) return i.chosen;
  } catch {
    // no longer a valid start: fall through to the next one
  }
  // Search from the later of "chosen" and the earliest bookable day: never earlier than the customer chose.
  const later = (earliest: string) => (i.chosen > earliest ? i.chosen : earliest);
  if (i.trialSendDays) return firstStartOnOrAfter(later(earliestTrialIso(i.todayBase, i.trialSendDays)), i.trialSendDays, i.closed);
  return firstStartOnOrAfter(later(earliestPlanStart(i.todayBase, i.allowedStartDays)), i.allowedStartDays, i.closed);
}

/** The next moment the daily cutoff passes in the app timezone: today's while it is still ahead, else tomorrow's. */
export function nextCutoffMs(now: number, cutoffHour: number, timezone: string): number {
  // cutoffMsFor(d) is the cutoff on the day before d, so "today's" cutoff is cutoffMsFor(tomorrow).
  const day = parseIsoDateUtc(zonedDateIso(now, timezone));
  for (;;) {
    day.setUTCDate(day.getUTCDate() + 1);
    const cut = cutoffMsFor(day.toISOString().slice(0, 10), cutoffHour, timezone);
    if (cut > now) return cut;
  }
}
