export type ExpiryChoice = { preset: number } | { date: string /* YYYY-MM-DD */ };

/** When a link made now with this choice stops working; NaN for a missing date. */
export function expiryFrom(choice: ExpiryChoice, now: number): number {
  if ("preset" in choice) return now + choice.preset * 1000;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(choice.date);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999).getTime() : NaN;
}
