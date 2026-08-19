export type VacationPauseRequest = {
  from: string;
  until: string;
  indefinite?: boolean;
};

/** Start only → pause all upcoming deliveries from that date until the customer resumes. */
export function buildVacationPauseRequest(startDate: string, endDate: string): VacationPauseRequest {
  if (!endDate) {
    return { from: startDate, until: startDate, indefinite: true };
  }
  return { from: startDate, until: endDate };
}

export function vacationRequiresEndDate(maxPauseStretchDays: number | null | undefined): boolean {
  return maxPauseStretchDays != null;
}

export function vacationSummaryMessage(startDate: string, endDate: string): string {
  if (!endDate) {
    return "All upcoming deliveries for this subscription will be paused from the start date until you resume.";
  }
  return "Deliveries for this subscription will be paused for the selected date range.";
}

/** Client-side vacation form checks. Past-cutoff days in the window are skipped server-side, not a reason to reject today as a start. */
export function validateVacationDates(input: {
  from: string;
  until: string;
  indefinite: boolean;
  today: string;
  endDateRequired: boolean;
  endDate: string;
}): string | null {
  if (!input.from) return "Start date is required";
  if (input.from < input.today) return "Start date cannot be in the past";
  if (input.endDateRequired && !input.endDate) return "This plan requires an end date for vacation";
  if (!input.indefinite && input.until < input.from) return "End date must be on or after the start date";
  return null;
}
