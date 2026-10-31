/** Analytics tabs show a full grid: one row of 4 or two rows of 8, never a ragged last row. */
export const ANALYTICS_CARD_COUNTS = [4, 8] as const;

export function isValidAnalyticsCardCount(n: number): boolean {
  return (ANALYTICS_CARD_COUNTS as readonly number[]).includes(n);
}
