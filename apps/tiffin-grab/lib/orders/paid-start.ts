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
  if (i.trialSendDays) return firstStartOnOrAfter(earliestTrialIso(i.todayBase, i.trialSendDays), i.trialSendDays, i.closed);
  return earliestPlanStart(i.todayBase, i.allowedStartDays, null, i.closed);
}
