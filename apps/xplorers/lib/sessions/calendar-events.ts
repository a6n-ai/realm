import type { AdminOccurrence } from "@/lib/services/studio-sessions.service";

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
const COLOR_HEX: Record<string, string> = {
  pink: "#ec4899",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  purple: "#a855f7",
  orange: "#f97316",
  green: "#22c55e",
  yellow: "#eab308",
};

export function colorVar(color: string): string {
  return COLOR_HEX[color] ?? "var(--color-primary)";
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
