import type { AttendanceMode, SessionCategory } from "@/db/schema/studio";
import type { PublicSession } from "@/lib/services/studio-sessions.service";
import { dayKey } from "./timezone";

export type BoardTone = "muted" | "action" | "ink";

export type PublicSessionCard = {
  publicId: string;
  title: string;
  time: string;
  spec: string;
  spots: string;
  tone: BoardTone;
  startsAt: Date;
  remaining: number;
  category: SessionCategory;
};

export const CATEGORY_LABELS: Record<SessionCategory, string> = {
  kids: "Kids",
  adults: "Adults",
  birthday: "Birthday",
  school: "School",
  drop_in: "Drop-in",
  private: "Private",
  other: "Studio",
};

export const ATTENDANCE_LABELS: Record<AttendanceMode, string> = {
  stay: "Stay",
  drop_off: "Drop-off",
  either: "Stay or drop-off",
};

export function formatSessionTime(startsAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(startsAt);
}

export function formatSessionDay(startsAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(startsAt)
    .replace(",", "");
}

export function formatTapeDay(date: Date, timeZone: string, now = new Date()): string {
  const label = formatSessionDay(date, timeZone);
  if (dayKey(date, timeZone) === dayKey(now, timeZone)) return `Today · ${label}`;
  return label;
}

function attendanceLabel(mode: AttendanceMode): string | null {
  switch (mode) {
    case "drop_off":
      return "Drop-off";
    case "stay":
      return "Stay";
    case "either":
      return null;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function toPublicSessionCard(session: PublicSession, timeZone: string): PublicSessionCard {
  const specParts = [
    session.audience,
    attendanceLabel(session.attendanceMode),
    session.priceDisplay,
    session.location,
  ].filter(Boolean);
  const spec = specParts.length ? specParts.join(" · ") : CATEGORY_LABELS[session.category];
  const full = session.remaining <= 0;
  const spots = full ? "Full" : `${session.remaining} spot${session.remaining === 1 ? "" : "s"} left`;
  const tone: BoardTone = full ? "muted" : session.remaining <= 4 ? "action" : "ink";
  return {
    publicId: session.publicId,
    title: session.title,
    time: formatSessionTime(session.startsAt, timeZone),
    spec,
    spots,
    tone,
    startsAt: session.startsAt,
    remaining: session.remaining,
    category: session.category,
  };
}

export type SessionDayGroup = {
  key: string;
  label: string;
  tape: string;
  rows: PublicSessionCard[];
};

export function groupSessionsByDay(
  cards: PublicSessionCard[],
  timeZone: string,
  now = new Date(),
): SessionDayGroup[] {
  const groups: SessionDayGroup[] = [];
  for (const card of cards) {
    const key = dayKey(card.startsAt, timeZone);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.rows.push(card);
      continue;
    }
    groups.push({
      key,
      label: formatSessionDay(card.startsAt, timeZone),
      tape: formatTapeDay(card.startsAt, timeZone, now),
      rows: [card],
    });
  }
  return groups;
}
