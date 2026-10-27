// The cutoff is shown once in the header from live settings, never per trip: a trip's
// stored cutoffAt is a snapshot and would show a stale hour after an admin changes it.
// Own module so the shells can import it without pulling in the deliveries view model.
export const cutoffTime = (cutoffHour: number) => `${cutoffHour % 12 || 12}:00 ${cutoffHour < 12 ? "am" : "pm"}`;
export const cutoffNote = (cutoffHour: number) => `Changes close at ${cutoffTime(cutoffHour)} the day before each delivery`;

/** Time left until the next cutoffHour:00 in the app timezone, and whether that is today. */
export function nextCutoff(nowMs: number, cutoffHour: number, timeZone: string): { ms: number; today: boolean } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(nowMs);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const secs = n("hour") * 3600 + n("minute") * 60 + n("second");
  const left = cutoffHour * 3600 - secs;
  // ponytail: assumes a 24h day, so a DST switch overnight reads an hour off until it passes.
  return { ms: (left > 0 ? left : left + 86_400) * 1000 - (nowMs % 1000), today: left > 0 };
}

/** A ticking timer: "12:04:09", then "42:05" under an hour. Seconds keep it reading as a countdown, not a clock time. */
/** "2h 54m" / "54m" / "<1m": minutes are enough for a cutoff, and a ticking seconds digit only adds noise. */
export function formatCountdown(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  if (mins < 1) return "<1m";
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${String(mins % 60).padStart(2, "0")}m` : `${mins}m`;
}
