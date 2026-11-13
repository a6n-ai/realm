import { tzOffsetMinutes } from "@foundry/commons";

// Admin date-time fields are entered and shown in the app-settings timezone (pass useTimezone()), so the
// stored instant is unambiguous whatever the admin's browser zone is.

/** Short zone name for field labels, e.g. "EDT". */
export function tzLabel(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(Date.now())
    .find((p) => p.type === "timeZoneName")?.value ?? tz;
}

/** epoch-ms to an `<input type="datetime-local">` value, as wall-clock time in `tz`. */
export function toLocalInput(ms: number | null, tz: string): string {
  if (ms == null) return "";
  const wall = ms + tzOffsetMinutes(tz, ms) * 60000;
  return new Date(wall).toISOString().slice(0, 16);
}

/** An `<input type="datetime-local">` value read as wall-clock time in `tz`, to epoch-ms. */
export function fromLocalInput(s: string, tz: string): number | null {
  if (!s) return null;
  const asUtc = new Date(`${s}:00Z`).getTime();
  if (!Number.isFinite(asUtc)) return null;
  return asUtc - tzOffsetMinutes(tz, asUtc) * 60000;
}
