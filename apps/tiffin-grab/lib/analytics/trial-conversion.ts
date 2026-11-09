/**
 * Trial → plan conversion for Analytics Overview, dated by when each trial was decided:
 * - converted: on the day its first later plan was booked (`laterPaidOrderBookedAtSql`), so a
 *   conversion shows in the month the customer bought, not the month the trial ended;
 * - lost: on the day its conversion window closed (`endDate + windowDays`) with no later plan;
 * - open: ended in range, no plan yet, window still running. Open trials stay out of the rate.
 * A trial is counted in at most one bucket for a given range, so the rate never passes 100%.
 */

export const TRIAL_CONVERT_WINDOW_DAYS = 14;

export type TrialEndRow = {
  orderId: string;
  /** ISO calendar date of the last trial delivery. */
  endDate: string;
  /** ISO calendar date the first later non-trial plan was booked, or null. */
  convertedOn: string | null;
};

export type TrialConversionStats = {
  eligible: number;
  converted: number;
  open: number;
  conversionRatePct: number | null;
  windowDays: number;
};

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Last calendar day on which a trial can still convert. */
export function conversionDeadline(endDate: string, windowDays: number): string {
  return addDaysIso(endDate, windowDays);
}

/** First trial end date whose window can close inside a range starting `fromIso`. */
export function earliestRelevantEnd(fromIso: string, windowDays = TRIAL_CONVERT_WINDOW_DAYS): string {
  return addDaysIso(fromIso, -windowDays);
}

/** All dates are ISO calendar days in the business timezone; the range is inclusive. */
export function summarizeTrialConversion(input: {
  trials: TrialEndRow[];
  fromIso: string;
  toIso: string;
  todayIso: string;
  windowDays?: number;
}): TrialConversionStats {
  const windowDays = input.windowDays ?? TRIAL_CONVERT_WINDOW_DAYS;
  const inRange = (iso: string) => iso >= input.fromIso && iso <= input.toIso;
  let converted = 0;
  let lost = 0;
  let open = 0;
  for (const trial of input.trials) {
    if (trial.convertedOn) {
      if (inRange(trial.convertedOn)) converted += 1;
      continue;
    }
    const deadline = conversionDeadline(trial.endDate, windowDays);
    if (deadline > input.todayIso) {
      if (inRange(trial.endDate)) open += 1;
    } else if (inRange(deadline)) {
      lost += 1;
    }
  }
  const eligible = converted + lost;
  return {
    eligible,
    converted,
    open,
    conversionRatePct: eligible > 0 ? Math.round((converted / eligible) * 1000) / 10 : null,
    windowDays,
  };
}
