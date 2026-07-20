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
