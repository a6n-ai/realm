/**
 * Trial → paid-plan conversion for Analytics Overview.
 *
 * Eligible: trials whose last delivery date falls in the selected range.
 * Converted: same customer placed a settled non-trial plan on or after the
 * trial was created, and within `windowDays` after the trial's last delivery.
 */

export const TRIAL_CONVERT_WINDOW_DAYS = 14;

export type TrialEndRow = {
  orderId: string;
  userId: string;
  /** Epoch ms when the trial order was created. */
  trialCreatedAt: number;
  /** ISO calendar date of the last trial delivery. */
  endDate: string;
};

export type PaidPlanRow = {
  userId: string;
  /** Epoch ms when the paid plan order was created. */
  createdAt: number;
};

export type TrialConversionStats = {
  eligible: number;
  converted: number;
  conversionRatePct: number | null;
  windowDays: number;
};

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Inclusive end of the conversion window as an ISO calendar day. */
export function conversionDeadline(endDate: string, windowDays: number): string {
  return addDaysIso(endDate, windowDays);
}

/**
 * True when `createdAt` (epoch ms) falls on a calendar day in `timezone` that is
 * on or before `deadlineIso`. Compared as calendar days so timezone walls match
 * analytics date filters.
 */
export function createdOnOrBeforeDeadline(
  createdAt: number,
  deadlineIso: string,
  timezone: string,
  isoDateInZone: (ms: number, tz: string) => string,
): boolean {
  return isoDateInZone(createdAt, timezone) <= deadlineIso;
}

export function summarizeTrialConversion(input: {
  trials: TrialEndRow[];
  paidPlans: PaidPlanRow[];
  timezone: string;
  isoDateInZone: (ms: number, tz: string) => string;
  windowDays?: number;
}): TrialConversionStats {
  const windowDays = input.windowDays ?? TRIAL_CONVERT_WINDOW_DAYS;
  const byUser = new Map<string, PaidPlanRow[]>();
  for (const p of input.paidPlans) {
    const list = byUser.get(p.userId) ?? [];
    list.push(p);
    byUser.set(p.userId, list);
  }

  let converted = 0;
  for (const trial of input.trials) {
    const deadline = conversionDeadline(trial.endDate, windowDays);
    const plans = byUser.get(trial.userId) ?? [];
    const hit = plans.some(
      (p) =>
        p.createdAt >= trial.trialCreatedAt &&
        createdOnOrBeforeDeadline(p.createdAt, deadline, input.timezone, input.isoDateInZone),
    );
    if (hit) converted += 1;
  }

  const eligible = input.trials.length;
  return {
    eligible,
    converted,
    conversionRatePct: eligible > 0 ? Math.round((converted / eligible) * 1000) / 10 : null,
    windowDays,
  };
}
