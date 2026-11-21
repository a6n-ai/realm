import { dateTimeFormat } from "@foundry/commons/util/intl-format";

// The cutoff is shown once in the header from live settings, never per trip: a trip's
// stored cutoffAt is a snapshot and would show a stale hour after an admin changes it.
// Own module so the shells can import it without pulling in the deliveries view model.
export const cutoffTime = (cutoffHour: number) => `${cutoffHour % 12 || 12}:00 ${cutoffHour < 12 ? "am" : "pm"}`;
export const cutoffNote = (cutoffHour: number) => `Changes close at ${cutoffTime(cutoffHour)} the day before each delivery`;

/** Time left until the next cutoffHour:00 in the app timezone, and whether that is today. */
export function nextCutoff(nowMs: number, cutoffHour: number, timeZone: string): { ms: number; today: boolean } {
  const parts = dateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(nowMs);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const secs = n("hour") * 3600 + n("minute") * 60 + n("second");
  const left = cutoffHour * 3600 - secs;
  // ponytail: assumes a 24h day, so a DST switch overnight reads an hour off until it passes.
  return { ms: (left > 0 ? left : left + 86_400) * 1000 - (nowMs % 1000), today: left > 0 };
}

/** "2h 54m" / "54m" / "<1m": minutes are enough for a cutoff, and a ticking seconds digit only adds noise. `short` for the admin card: "15h", "2h 5m". */
export function formatCountdown(ms: number, short = false): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  if (mins < 1) return "<1m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (!short) return `${h}h ${String(m).padStart(2, "0")}m`;
  return h >= 10 || m === 0 ? `${h}h` : `${h}h ${m}m`;
}
