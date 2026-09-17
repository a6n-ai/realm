import { ValidationError } from "@foundry/commons";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { app, bookings, studioSessionOccurrences, studioSessions } from "@/db/schema";
import { ATTENDANCE_MODES, SESSION_CATEGORIES, type AttendanceMode, type SessionCategory } from "@/db/schema/studio";
import { dayKey } from "@/lib/sessions/timezone";
import { assertSameCalendarDay, occurrenceEndsAt, occurrenceStartsAt, parseDates } from "@/lib/sessions/schedule";
import { remainingSeats, isPubliclyListed } from "./booking-policy";
import { currentUserId, SessionUpdatableService } from "./session-service";
import { studioSessionsRepository, type StudioSessionRow } from "./studio-sessions.repository";

export { ATTENDANCE_MODES, SESSION_CATEGORIES, type AttendanceMode, type SessionCategory };

export type PublicSession = StudioSessionRow & {
  remaining: number;
  occurrencePublicId: string;
  occursOn: string;
};

export type AdminSession = StudioSessionRow & { dates: string[] };

const confirmedAgg = db
  .select({
    occurrenceId: bookings.occurrenceId,
    seats: sql<number>`coalesce(sum(${bookings.seats}), 0)`.as("seats"),
  })
  .from(bookings)
  .where(eq(bookings.status, "confirmed"))
  .groupBy(bookings.occurrenceId)
  .as("confirmed_seats");

class StudioSessionsService extends SessionUpdatableService<typeof studioSessions> {
  async createSession(input: Record<string, unknown>, timeZone?: string): Promise<StudioSessionRow> {
    const { record, dates } = normalizeSessionWrite(input, timeZone);
    const row = await this.create(record);
    await replaceOccurrences(row.id, dates);
    return row;
  }

  async updateSession(publicId: string, input: Record<string, unknown>, timeZone?: string): Promise<StudioSessionRow> {
    const { record, dates } = normalizeSessionWrite(input, timeZone);
    const row = await this.update(publicId, record);
    await replaceOccurrences(row.id, dates);
    return row;
  }

  async archive(publicId: string): Promise<StudioSessionRow> {
    return this.update(publicId, { archived: true, published: false });
  }

  async setPublished(publicId: string, published: boolean): Promise<StudioSessionRow> {
    return this.update(publicId, { published });
  }

  async listAdmin(): Promise<AdminSession[]> {
    const sessions = await db
      .select()
      .from(studioSessions)
      .where(eq(studioSessions.archived, false))
      .orderBy(desc(studioSessions.startsAt));
    const ids = sessions.map((session) => session.id);
    const days =
      ids.length === 0
        ? []
        : await db
            .select({ sessionId: studioSessionOccurrences.sessionId, occursOn: studioSessionOccurrences.occursOn })
            .from(studioSessionOccurrences)
            .where(inArray(studioSessionOccurrences.sessionId, ids))
            .orderBy(asc(studioSessionOccurrences.occursOn));
    const bySession = new Map<bigint, string[]>();
    for (const day of days) {
      const list = bySession.get(day.sessionId) ?? [];
      list.push(day.occursOn);
      bySession.set(day.sessionId, list);
    }
    return sessions.map((session) => ({ ...session, dates: bySession.get(session.id) ?? [] }));
  }

  async readWithDates(publicId: string): Promise<AdminSession> {
    const row = await this.read(publicId);
    const days = await db
      .select({ occursOn: studioSessionOccurrences.occursOn })
      .from(studioSessionOccurrences)
      .where(eq(studioSessionOccurrences.sessionId, row.id))
      .orderBy(asc(studioSessionOccurrences.occursOn));
    return { ...row, dates: days.map((day) => day.occursOn) };
  }

  async listPublished(now = new Date()): Promise<PublicSession[]> {
    const timeZone = await this.timezone();
    const rows = await db
      .select({
        session: studioSessions,
        occurrence: studioSessionOccurrences,
        confirmed: confirmedAgg.seats,
      })
      .from(studioSessionOccurrences)
      .innerJoin(studioSessions, eq(studioSessions.id, studioSessionOccurrences.sessionId))
      .leftJoin(confirmedAgg, eq(confirmedAgg.occurrenceId, studioSessionOccurrences.id))
      .where(and(eq(studioSessions.published, true), eq(studioSessions.archived, false)))
      .orderBy(asc(studioSessionOccurrences.occursOn), asc(studioSessions.startsAt));
    return rows
      .map(({ session, occurrence, confirmed }) => toPublicSession(session, occurrence, confirmed, timeZone))
      .filter((session) => isPubliclyListed(session, now));
  }

  async getPublished(occurrencePublicId: string, now = new Date()): Promise<PublicSession> {
    const timeZone = await this.timezone();
    const [row] = await db
      .select({
        session: studioSessions,
        occurrence: studioSessionOccurrences,
        confirmed: confirmedAgg.seats,
      })
      .from(studioSessionOccurrences)
      .innerJoin(studioSessions, eq(studioSessions.id, studioSessionOccurrences.sessionId))
      .leftJoin(confirmedAgg, eq(confirmedAgg.occurrenceId, studioSessionOccurrences.id))
      .where(eq(studioSessionOccurrences.publicId, occurrencePublicId))
      .limit(1);
    if (!row) throw new ValidationError("Session not found.");
    const listed = toPublicSession(row.session, row.occurrence, row.confirmed, timeZone);
    if (!isPubliclyListed(listed, now)) throw new ValidationError("This session is not open for booking.");
    return listed;
  }

  async timezone(): Promise<string> {
    const [row] = await db.select({ timezone: app.timezone }).from(app).limit(1);
    return row?.timezone ?? "Asia/Singapore";
  }
}

export const studioSessionsService = new StudioSessionsService(studioSessionsRepository);

function toPublicSession(
  session: StudioSessionRow,
  occurrence: { publicId: string; occursOn: string },
  confirmed: number | null,
  timeZone: string,
): PublicSession {
  return {
    ...session,
    occurrencePublicId: occurrence.publicId,
    occursOn: occurrence.occursOn,
    startsAt: occurrenceStartsAt(occurrence.occursOn, session.startsAt, timeZone),
    endsAt: occurrenceEndsAt(occurrence.occursOn, session.startsAt, session.endsAt, timeZone),
    remaining: remainingSeats(session.capacity, Number(confirmed ?? 0)),
  };
}

async function replaceOccurrences(sessionId: bigint, dates: string[]): Promise<void> {
  const existing = await db
    .select()
    .from(studioSessionOccurrences)
    .where(eq(studioSessionOccurrences.sessionId, sessionId));
  const byDay = new Map(existing.map((row) => [row.occursOn, row]));
  const booked = new Set<bigint>();
  if (existing.length > 0) {
    const rows = await db
      .select({ occurrenceId: bookings.occurrenceId })
      .from(bookings)
      .where(
        and(
          inArray(
            bookings.occurrenceId,
            existing.map((row) => row.id),
          ),
          eq(bookings.status, "confirmed"),
        ),
      );
    for (const row of rows) booked.add(row.occurrenceId);
  }

  const actorId = await currentUserId();
  for (const date of dates) {
    if (byDay.has(date)) continue;
    await db.insert(studioSessionOccurrences).values({
      sessionId,
      occursOn: date,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }
  for (const row of existing) {
    if (dates.includes(row.occursOn)) continue;
    if (booked.has(row.id)) {
      throw new ValidationError(`Keep ${row.occursOn}; that day already has bookings.`);
    }
    await db.delete(studioSessionOccurrences).where(eq(studioSessionOccurrences.id, row.id));
  }
}

function isSessionCategory(value: unknown): value is SessionCategory {
  return typeof value === "string" && (SESSION_CATEGORIES as readonly string[]).includes(value);
}

function isAttendanceMode(value: unknown): value is AttendanceMode {
  return typeof value === "string" && (ATTENDANCE_MODES as readonly string[]).includes(value);
}

function normalizeSessionWrite(
  input: Record<string, unknown>,
  timeZone?: string,
): { record: Record<string, unknown>; dates: string[] } {
  const title = String(input.title ?? "").trim();
  if (!title) throw new ValidationError("Title is required.");
  if (!isSessionCategory(input.category)) throw new ValidationError("Pick a category.");
  const attendanceMode = input.attendanceMode ?? "either";
  if (!isAttendanceMode(attendanceMode)) throw new ValidationError("Pick stay, drop-off, or either.");
  const capacity = Number(input.capacity);
  if (!Number.isInteger(capacity) || capacity < 1) throw new ValidationError("Capacity must be at least 1.");
  const startsAt = toDate(input.startsAt);
  const endsAt = toDate(input.endsAt);
  if (endsAt.getTime() <= startsAt.getTime()) throw new ValidationError("End must be after start.");
  const zone = timeZone ?? "UTC";
  assertSameCalendarDay(startsAt, endsAt, zone);
  const extra = Array.isArray(input.alsoOn) ? input.alsoOn : [];
  const dates = parseDates([dayKey(startsAt, zone), ...extra]);
  return {
    record: {
      title,
      category: input.category,
      description: emptyToNull(input.description),
      startsAt,
      endsAt,
      audience: emptyToNull(input.audience),
      capacity,
      priceDisplay: emptyToNull(input.priceDisplay),
      location: emptyToNull(input.location),
      attendanceMode,
      published: input.published === true || input.published === "on" || input.published === "true",
      weekdays: [],
      repeatsUntil: null,
    },
    dates,
  };
}

export { normalizeSessionWrite };

function toDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  throw new ValidationError("Start and end times are required.");
}

function emptyToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
