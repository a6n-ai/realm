const pad = (n: number) => String(n).padStart(2, "0");

export const toDateInput = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const tomorrowInput = (now: number = Date.now()): string => {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return toDateInput(d.getTime());
};

// A follow-up has a day, not a time: it falls due at 09:00 browser time that day. Null for a malformed value.
export function fromDateInput(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9).getTime();
  return Number.isFinite(at) ? at : null;
}
