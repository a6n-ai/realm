/** Same ISO week (Mon–Sun) for two calendar dates `YYYY-MM-DD`. */
export function sameIsoWeek(a: string, b: string): boolean {
  if (!a || !b) return false;
  const wa = isoWeekKey(a);
  const wb = isoWeekKey(b);
  return wa !== null && wa === wb;
}

export function anySameIsoWeek(candidate: string, existing: readonly string[]): boolean {
  return existing.some((d) => sameIsoWeek(candidate, d));
}

/** Monday-based ISO week key: `${year}-W${week}`. */
export function isoWeekKey(isoDate: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  // ISO: Thursday determines week-year
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
