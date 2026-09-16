import { ValidationError } from "@foundry/commons";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { app, bookings, studioSessions } from "@/db/schema";
import { ATTENDANCE_MODES, SESSION_CATEGORIES, type AttendanceMode, type SessionCategory } from "@/db/schema/studio";
import { remainingSeats, isPubliclyListed } from "./booking-policy";
import { SessionUpdatableService } from "./session-service";
import { studioSessionsRepository, type StudioSessionRow } from "./studio-sessions.repository";

export { ATTENDANCE_MODES, SESSION_CATEGORIES, type AttendanceMode, type SessionCategory };

export type PublicSession = StudioSessionRow & { remaining: number };

const confirmedAgg = db
  .select({
    sessionId: bookings.sessionId,
    seats: sql<number>`coalesce(sum(${bookings.seats}), 0)`.as("seats"),
  })
  .from(bookings)
  .where(eq(bookings.status, "confirmed"))
  .groupBy(bookings.sessionId)
  .as("confirmed_seats");

class StudioSessionsService extends SessionUpdatableService<typeof studioSessions> {
  async createSession(input: Record<string, unknown>): Promise<StudioSessionRow> {
    return this.create(normalizeSessionWrite(input));
  }

  async updateSession(publicId: string, input: Record<string, unknown>): Promise<StudioSessionRow> {
    return this.update(publicId, normalizeSessionWrite(input));
  }

  async archive(publicId: string): Promise<StudioSessionRow> {
    return this.update(publicId, { archived: true, published: false });
  }

  async setPublished(publicId: string, published: boolean): Promise<StudioSessionRow> {
    return this.update(publicId, { published });
  }

  async listAdmin(): Promise<StudioSessionRow[]> {
    return db
      .select()
      .from(studioSessions)
      .where(eq(studioSessions.archived, false))
      .orderBy(desc(studioSessions.startsAt));
  }

  async listPublished(now = new Date()): Promise<PublicSession[]> {
    const rows = await db
      .select({ session: studioSessions, confirmed: confirmedAgg.seats })
      .from(studioSessions)
      .leftJoin(confirmedAgg, eq(confirmedAgg.sessionId, studioSessions.id))
      .where(
        and(eq(studioSessions.published, true), eq(studioSessions.archived, false), gt(studioSessions.startsAt, now)),
      )
      .orderBy(asc(studioSessions.startsAt));
    return rows.map(({ session, confirmed }) => ({
      ...session,
      remaining: remainingSeats(session.capacity, Number(confirmed ?? 0)),
    }));
  }

  async getPublished(publicId: string, now = new Date()): Promise<PublicSession> {
    const [row] = await db
      .select({ session: studioSessions, confirmed: confirmedAgg.seats })
      .from(studioSessions)
      .leftJoin(confirmedAgg, eq(confirmedAgg.sessionId, studioSessions.id))
      .where(eq(studioSessions.publicId, publicId))
      .limit(1);
    if (!row) throw new ValidationError("Session not found.");
    const remaining = remainingSeats(row.session.capacity, Number(row.confirmed ?? 0));
    if (!isPubliclyListed(row.session, now)) throw new ValidationError("This session is not open for booking.");
    return { ...row.session, remaining };
  }

  async timezone(): Promise<string> {
    const [row] = await db.select({ timezone: app.timezone }).from(app).limit(1);
    return row?.timezone ?? "Asia/Singapore";
  }
}

export const studioSessionsService = new StudioSessionsService(studioSessionsRepository);

function isSessionCategory(value: unknown): value is SessionCategory {
  return typeof value === "string" && (SESSION_CATEGORIES as readonly string[]).includes(value);
}

function isAttendanceMode(value: unknown): value is AttendanceMode {
  return typeof value === "string" && (ATTENDANCE_MODES as readonly string[]).includes(value);
}

function normalizeSessionWrite(input: Record<string, unknown>): Record<string, unknown> {
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
  return {
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
