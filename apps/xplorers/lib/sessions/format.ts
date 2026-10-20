import type { AttendanceMode, SessionCategory } from "@/db/schema/studio";
import type { PublicSession } from "@/lib/services/studio-sessions.service";
import type { ClassBookingType } from "@/db/schema/studio";
import { priceLine } from "@/lib/pricing/price-line";
import type { PriceTable } from "@/lib/pricing/types";
import { dayKey } from "./timezone";

export type BoardTone = "muted" | "action" | "ink";

export type PublicSessionCard = {
  publicId: string;
  occurrenceKey: string;
  title: string;
  time: string;
  spec: string;
  spots: string;
  tone: BoardTone;
  startsAt: Date;
  remaining: number;
  category: SessionCategory;
  photos: string[];
  description: string | null;
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

export function formatClassClock(startsAt: Date, endsAt: Date, timeZone: string): string {
  return `${formatSessionTime(startsAt, timeZone)} – ${formatSessionTime(endsAt, timeZone)}`;
}

export function formatScheduleLabel(session: { startsAt: Date }, timeZone: string): string {
  return `${formatSessionDay(session.startsAt, timeZone)} · ${formatSessionTime(session.startsAt, timeZone)}`;
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

export function audienceLabel(c: { ageMin: number | null; ageMax: number | null }): string | null {
  if (c.ageMin != null && c.ageMax != null) return `Ages ${c.ageMin}-${c.ageMax}`;
  if (c.ageMin != null) return `Ages ${c.ageMin}+`;
  if (c.ageMax != null) return `Up to age ${c.ageMax}`;
  return null;
}

export function toPublicSessionCard(session: PublicSession, timeZone: string): PublicSessionCard {
  const specParts = [
    audienceLabel(session),
    attendanceLabel(session.attendanceMode),
    session.location,
  ].filter(Boolean);
  const spec = specParts.length ? specParts.join(" · ") : CATEGORY_LABELS[session.category];
  const full = session.remaining <= 0;
  const spots = full ? "Full" : `${session.remaining} spot${session.remaining === 1 ? "" : "s"} left`;
  const tone: BoardTone = full ? "muted" : session.remaining <= 4 ? "action" : "ink";
  return {
    publicId: session.occurrencePublicId,
    occurrenceKey: session.occurrencePublicId,
    title: session.title,
    time: formatSessionTime(session.startsAt, timeZone),
    spec,
    spots,
    tone,
    startsAt: session.startsAt,
    remaining: session.remaining,
    category: session.category,
    photos: session.photos ?? [],
    description: session.summary || null,
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

/** A bookable class on the public Classes pages, with its upcoming dates. */
export type PublicClass = {
  publicId: string;
  title: string;
  category: SessionCategory;
  audience: string | null;
  summary: string;
  included: string | null;
  scheduleLine: string | null;
  groupSize: string | null;
  ageMin: number | null;
  ageMax: number | null;
  color: string;
  bookingType: ClassBookingType;
  photos: string[];
  priceLine: string;
  location: string | null;
  /** First upcoming date, or null when nothing is scheduled. */
  nextDate: string | null;
  sessions: PublicSessionCard[];
};

type ClassFields = Pick<
  PublicSession,
  | "publicId"
  | "title"
  | "category"
  | "ageMin"
  | "ageMax"
  | "summary"
  | "included"
  | "scheduleLine"
  | "groupSize"
  | "color"
  | "bookingType"
  | "pricing"
  | "photos"
  | "prices"
  | "location"
>;

/** Keeps the caller's order (the admin's sortOrder). */
export function groupPublicClasses(
  classes: ClassFields[],
  sessions: PublicSession[],
  timeZone: string,
  currency: string,
  globalPrices: PriceTable,
): PublicClass[] {
  const byClass = new Map<string, PublicSession[]>();
  for (const s of sessions) byClass.set(s.publicId, [...(byClass.get(s.publicId) ?? []), s]);

  return classes
    .map((c) => {
      const upcoming = (byClass.get(c.publicId) ?? []).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      return {
        publicId: c.publicId,
        title: c.title,
        category: c.category,
        audience: audienceLabel(c),
        summary: c.summary,
        included: c.included,
        scheduleLine: c.scheduleLine,
        groupSize: c.groupSize,
        ageMin: c.ageMin,
        ageMax: c.ageMax,
        color: c.color,
        bookingType: c.bookingType,
        photos: c.photos ?? [],
        priceLine:
          c.bookingType === "enquire_only"
            ? "Enquire for dates & pricing"
            : priceLine(c.pricing, c.prices, globalPrices, currency),
        location: c.location,
        nextDate: upcoming[0] ? formatSessionDay(upcoming[0].startsAt, timeZone) : null,
        // Rows span several days on a class page, so the day leads the time.
        sessions: upcoming.map((s) => {
          const card = toPublicSessionCard(s, timeZone);
          return { ...card, time: `${formatSessionDay(s.startsAt, timeZone)} · ${card.time}` };
        }),
      };
    });
}

/** Named swatches matching the printed class palette; the class stores the name. */
export const CLASS_COLORS = ["pink", "sky", "blue", "purple", "orange", "green", "yellow"] as const;
export type ClassColor = (typeof CLASS_COLORS)[number];
