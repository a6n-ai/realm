import type { AdminOccurrence } from "@/lib/services/studio-sessions.service";
import type { ClassColor } from "@/lib/sessions/format";
import { addDayKey } from "@/lib/sessions/timezone";

export type CalendarSession = {
  publicId: string;
  classPublicId: string;
  title: string;
  color: string;
  startsAt: string;
  endsAt: string;
  remaining: number;
  capacity: number;
  cancelled: boolean;
};

// Tailwind 500 shades as literals: the calendar takes a css colour, and Tailwind only emits
// --color-* vars it sees used in class names, so var() references would resolve to nothing.
const COLOR_HEX: Record<ClassColor, string> = {
  pink: "#ec4899",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  purple: "#a855f7",
  orange: "#f97316",
  green: "#22c55e",
  yellow: "#eab308",
};

export function colorVar(color: string): string {
  return COLOR_HEX[color as ClassColor] ?? "var(--color-primary)";
}

export function toCalendarSessions(rows: AdminOccurrence[]): CalendarSession[] {
  return rows.map((r) => {
    const cancelled = r.status === "cancelled";
    return {
      publicId: r.publicId,
      classPublicId: r.classPublicId,
      title: cancelled ? `${r.title} (Cancelled)` : r.title,
      color: r.color,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      remaining: r.remaining,
      capacity: r.capacity,
      cancelled,
    };
  });
}

export const MAX_RANGE_DAYS = 62;

export function isRealDay(v: string | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const ms = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === v;
}

/** A from/to pair off the URL, or the fallback when it is malformed, reversed or wider than MAX_RANGE_DAYS. */
export function parseRange(
  from: string | undefined,
  to: string | undefined,
  fallback: { from: string; to: string },
): { from: string; to: string } {
  if (!isRealDay(from) || !isRealDay(to) || from > to) return fallback;
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  return span > MAX_RANGE_DAYS ? { from, to: addDayKey(from, MAX_RANGE_DAYS) } : { from, to };
}
