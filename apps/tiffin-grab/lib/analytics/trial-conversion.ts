/**
 * Trial → plan conversion for Analytics Overview.
 *
 * Eligible: trials whose last tiffin falls in the selected range AND whose conversion window has
 * closed (`endDate + windowDays <= today`), so a customer still deciding is not counted as lost.
 * Trials still inside the window come back as `open` and stay out of the rate.
 * Whether a trial converted is decided in SQL by the same "later plan" rule the Renewals desk uses.
 */

export const TRIAL_CONVERT_WINDOW_DAYS = 14;

export type TrialEndRow = {
  orderId: string;
  /** ISO calendar date of the last trial delivery. */
  endDate: string;
  /** A later non-trial plan exists for the customer (`laterPaidOrderSql`). */
  converted: boolean;
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

/** `todayIso` is the current calendar day in the business timezone. */
export function summarizeTrialConversion(input: {
  trials: TrialEndRow[];
  todayIso: string;
  windowDays?: number;
}): TrialConversionStats {
  const windowDays = input.windowDays ?? TRIAL_CONVERT_WINDOW_DAYS;
  let eligible = 0;
  let converted = 0;
  let open = 0;
  for (const trial of input.trials) {
    if (conversionDeadline(trial.endDate, windowDays) > input.todayIso) {
      open += 1;
      continue;
    }
    eligible += 1;
    if (trial.converted) converted += 1;
  }
  return {
    eligible,
    converted,
    open,
    conversionRatePct: eligible > 0 ? Math.round((converted / eligible) * 1000) / 10 : null,
    windowDays,
  };
}
