import { ValidationError } from "@foundry/commons";
import type { Condition, FilterCondition } from "@foundry/commons/model/condition";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { columnResolver, conditionToSql } from "@foundry/database";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { app, bookings, studioSessionOccurrences, studioSessions } from "@/db/schema";
import { ATTENDANCE_MODES, SESSION_CATEGORIES, type AttendanceMode, type SessionCategory } from "@/db/schema/studio";
import type { SortState } from "@/lib/list/sort";
import { monthGrid } from "@/lib/sessions/calendar";
import { parsePhotos } from "@/lib/sessions/photos";
import {
  assertSameCalendarDay,
  clockFrom,
  fromZonedClock,
  occurrenceEndsAt,
  occurrenceStartsAt,
  parseDay,
} from "@/lib/sessions/schedule";
import { dayKey } from "@/lib/sessions/timezone";
import { remainingSeats, isPubliclyListed } from "./booking-policy";
import { currentUserId, SessionUpdatableService } from "./session-service";
import { studioSessionsRepository, type StudioSessionRow } from "./studio-sessions.repository";

export { ATTENDANCE_MODES, SESSION_CATEGORIES, type AttendanceMode, type SessionCategory };

export type PublicSession = StudioSessionRow & {
  remaining: number;
  occurrencePublicId: string;
  occursOn: string;
};

export type ClassSortColumn = "title" | "category" | "startsAt" | "capacity" | "published" | "createdAt";
export type SessionSortColumn = "occursOn" | "title" | "category" | "published";

export type AdminClassRow = StudioSessionRow & { sessionCount: number };

export type AdminOccurrence = {
  publicId: string;
  classPublicId: string;
  title: string;
  category: SessionCategory;
  occursOn: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  remaining: number;
  published: boolean;
  location: string | null;
  archived: boolean;
};

export type ClassOption = {
  publicId: string;
  title: string;
  capacity: number;
  startsAt: Date;
  endsAt: Date;
};

const CLASS_SORT = {
  title: studioSessions.title,
  category: studioSessions.category,
  startsAt: studioSessions.startsAt,
  capacity: studioSessions.capacity,
  published: studioSessions.published,
  createdAt: studioSessions.createdAt,
} as const;

const SESSION_SORT = {
  occursOn: studioSessionOccurrences.occursOn,
  title: studioSessions.title,
  category: studioSessions.category,
  published: studioSessions.published,
} as const;

const confirmedAgg = db
  .select({
    occurrenceId: bookings.occurrenceId,
    seats: sql<number>`coalesce(sum(${bookings.seats}), 0)`.as("seats"),
  })
  .from(bookings)
  .where(eq(bookings.status, "confirmed"))
  .groupBy(bookings.occurrenceId)
  .as("confirmed_seats");

const sessionCountAgg = db
  .select({
    sessionId: studioSessionOccurrences.sessionId,
    n: sql<number>`cast(count(*) as int)`.as("n"),
  })
  .from(studioSessionOccurrences)
  .groupBy(studioSessionOccurrences.sessionId)
  .as("session_counts");

class StudioSessionsService extends SessionUpdatableService<typeof studioSessions> {
  async createClass(input: Record<string, unknown>, timeZone?: string): Promise<StudioSessionRow> {
    return this.create(normalizeClassWrite(input, timeZone));
  }

  async updateClass(publicId: string, input: Record<string, unknown>, timeZone?: string): Promise<StudioSessionRow> {
    return this.update(publicId, normalizeClassWrite(input, timeZone));
  }

  async archive(publicId: string): Promise<StudioSessionRow> {
    return this.update(publicId, { archived: true, published: false });
  }

  async setPublished(publicId: string, published: boolean): Promise<StudioSessionRow> {
    return this.update(publicId, { published });
  }

  async queryClasses(
    condition: Condition | undefined,
    page: PageRequest,
    sort: SortState<ClassSortColumn> = { column: "title", dir: "asc" },
  ): Promise<Page<AdminClassRow>> {
    const where = and(eq(studioSessions.archived, false), conditionToSql(condition, resolveClassFacet));
    const col = CLASS_SORT[sort.column] ?? studioSessions.title;
    const order = sort.dir === "asc" ? asc(col) : desc(col);

    const [items, [{ count }]] = await Promise.all([
      db
        .select({
          session: studioSessions,
          sessionCount: sessionCountAgg.n,
        })
        .from(studioSessions)
        .leftJoin(sessionCountAgg, eq(sessionCountAgg.sessionId, studioSessions.id))
        .where(where)
        .orderBy(order)
        .limit(page.size)
        .offset(page.page * page.size),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(studioSessions).where(where),
    ]);

    return {
      items: items.map((row) => ({ ...row.session, sessionCount: Number(row.sessionCount ?? 0) })),
      page: page.page,
      size: page.size,
      total: count,
    };
  }

  async querySessions(
    condition: Condition | undefined,
    page: PageRequest,
    sort: SortState<SessionSortColumn> = { column: "occursOn", dir: "desc" },
    opts: { classPublicId?: string; timeZone?: string } = {},
  ): Promise<Page<AdminOccurrence>> {
    const timeZone = opts.timeZone ?? (await this.timezone());
    const where = and(
      eq(studioSessions.archived, false),
      opts.classPublicId ? eq(studioSessions.publicId, opts.classPublicId) : undefined,
      conditionToSql(condition, resolveSessionFacet(timeZone)),
    );
    const col = SESSION_SORT[sort.column] ?? studioSessionOccurrences.occursOn;
    const order = sort.dir === "asc" ? asc(col) : desc(col);

    const [items, [{ count }]] = await Promise.all([
      db
        .select({
          session: studioSessions,
          occurrence: studioSessionOccurrences,
          confirmed: confirmedAgg.seats,
        })
        .from(studioSessionOccurrences)
        .innerJoin(studioSessions, eq(studioSessions.id, studioSessionOccurrences.sessionId))
        .leftJoin(confirmedAgg, eq(confirmedAgg.occurrenceId, studioSessionOccurrences.id))
        .where(where)
        .orderBy(order, asc(studioSessions.startsAt))
        .limit(page.size)
        .offset(page.page * page.size),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(studioSessionOccurrences)
        .innerJoin(studioSessions, eq(studioSessions.id, studioSessionOccurrences.sessionId))
        .where(where),
    ]);

    return {
      items: items.map((row) => toAdminOccurrence(row.session, row.occurrence, row.confirmed, timeZone)),
      page: page.page,
      size: page.size,
      total: count,
    };
  }

  async listMonth(month: string, timeZone?: string): Promise<AdminOccurrence[]> {
    const zone = timeZone ?? (await this.timezone());
    const grid = monthGrid(month);
    const start = grid[0]?.date;
    const end = grid[grid.length - 1]?.date;
    if (!start || !end) return [];
    const rows = await db
      .select({
        session: studioSessions,
        occurrence: studioSessionOccurrences,
        confirmed: confirmedAgg.seats,
      })
      .from(studioSessionOccurrences)
      .innerJoin(studioSessions, eq(studioSessions.id, studioSessionOccurrences.sessionId))
      .leftJoin(confirmedAgg, eq(confirmedAgg.occurrenceId, studioSessionOccurrences.id))
      .where(
        and(
          eq(studioSessions.archived, false),
          gte(studioSessionOccurrences.occursOn, start),
          lte(studioSessionOccurrences.occursOn, end),
        ),
      )
      .orderBy(asc(studioSessionOccurrences.occursOn), asc(studioSessions.startsAt));
    return rows.map((row) => toAdminOccurrence(row.session, row.occurrence, row.confirmed, zone));
  }

  async listClassOptions(): Promise<ClassOption[]> {
    const rows = await db
      .select({
        publicId: studioSessions.publicId,
        title: studioSessions.title,
        capacity: studioSessions.capacity,
        startsAt: studioSessions.startsAt,
        endsAt: studioSessions.endsAt,
      })
      .from(studioSessions)
      .where(eq(studioSessions.archived, false))
      .orderBy(asc(studioSessions.title));
    return rows;
  }

  async readOccurrence(publicId: string, timeZone?: string): Promise<AdminOccurrence> {
    const zone = timeZone ?? (await this.timezone());
    const [row] = await db
      .select({
        session: studioSessions,
        occurrence: studioSessionOccurrences,
        confirmed: confirmedAgg.seats,
      })
      .from(studioSessionOccurrences)
      .innerJoin(studioSessions, eq(studioSessions.id, studioSessionOccurrences.sessionId))
      .leftJoin(confirmedAgg, eq(confirmedAgg.occurrenceId, studioSessionOccurrences.id))
      .where(eq(studioSessionOccurrences.publicId, publicId))
      .limit(1);
    if (!row) throw new ValidationError("Session not found.");
    return toAdminOccurrence(row.session, row.occurrence, row.confirmed, zone);
  }

  async scheduleSession(classPublicId: string, occursOn: string): Promise<{ publicId: string; occursOn: string }> {
    const day = parseDay(occursOn);
    const klass = await this.read(classPublicId);
    if (klass.archived) throw new ValidationError("Archive is closed. Pick an active class.");
    const [existing] = await db
      .select({ publicId: studioSessionOccurrences.publicId })
      .from(studioSessionOccurrences)
      .where(and(eq(studioSessionOccurrences.sessionId, klass.id), eq(studioSessionOccurrences.occursOn, day)))
      .limit(1);
    if (existing) throw new ValidationError("This class is already scheduled that day.");
    const actorId = await currentUserId();
    const [row] = await db
      .insert(studioSessionOccurrences)
      .values({
        sessionId: klass.id,
        occursOn: day,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning({ publicId: studioSessionOccurrences.publicId, occursOn: studioSessionOccurrences.occursOn });
    if (!row) throw new ValidationError("Could not schedule the session.");
    return row;
  }

  async unscheduleSession(occurrencePublicId: string): Promise<string> {
    const [occurrence] = await db
      .select()
      .from(studioSessionOccurrences)
      .where(eq(studioSessionOccurrences.publicId, occurrencePublicId))
      .limit(1);
    if (!occurrence) throw new ValidationError("Session not found.");
    const [booked] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.occurrenceId, occurrence.id), eq(bookings.status, "confirmed")))
      .limit(1);
    if (booked) throw new ValidationError(`Keep ${occurrence.occursOn}; that day already has bookings.`);
    await db.delete(studioSessionOccurrences).where(eq(studioSessionOccurrences.id, occurrence.id));
    return occurrence.occursOn;
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

function toAdminOccurrence(
  session: StudioSessionRow,
  occurrence: { publicId: string; occursOn: string },
  confirmed: number | null,
  timeZone: string,
): AdminOccurrence {
  return {
    publicId: occurrence.publicId,
    classPublicId: session.publicId,
    title: session.title,
    category: session.category,
    occursOn: occurrence.occursOn,
    startsAt: occurrenceStartsAt(occurrence.occursOn, session.startsAt, timeZone),
    endsAt: occurrenceEndsAt(occurrence.occursOn, session.startsAt, session.endsAt, timeZone),
    capacity: session.capacity,
    remaining: remainingSeats(session.capacity, Number(confirmed ?? 0)),
    published: session.published,
    location: session.location,
    archived: session.archived,
  };
}

function isSessionCategory(value: unknown): value is SessionCategory {
  return typeof value === "string" && (SESSION_CATEGORIES as readonly string[]).includes(value);
}

function isAttendanceMode(value: unknown): value is AttendanceMode {
  return typeof value === "string" && (ATTENDANCE_MODES as readonly string[]).includes(value);
}

function asPublished(value: unknown): boolean {
  return value === true || value === "true";
}

function asDayKey(value: unknown, timeZone: string): string {
  if (typeof value === "number" && Number.isFinite(value)) return dayKey(new Date(value), timeZone);
  if (typeof value === "string" && /^\d+$/.test(value)) return dayKey(new Date(Number(value)), timeZone);
  return parseDay(value);
}

function resolveClassFacet(f: FilterCondition) {
  if (f.field === "published" && f.operator === "eq") {
    return eq(studioSessions.published, asPublished(f.value));
  }
  return columnResolver({
    title: studioSessions.title,
    location: studioSessions.location,
    publicId: studioSessions.publicId,
    category: studioSessions.category,
    published: studioSessions.published,
  })(f);
}

function resolveSessionFacet(timeZone: string) {
  return (f: FilterCondition) => {
    if (f.field === "published" && f.operator === "eq") {
      return eq(studioSessions.published, asPublished(f.value));
    }
    if (f.field === "occursOn") {
      const col = studioSessionOccurrences.occursOn;
      switch (f.operator) {
        case "eq":
          return eq(col, asDayKey(f.value, timeZone));
        case "gte":
          return gte(col, asDayKey(f.value, timeZone));
        case "lte":
          return lte(col, asDayKey(f.value, timeZone));
        case "between": {
          const pair = Array.isArray(f.value) ? f.value : [];
          const start = asDayKey(pair[0], timeZone);
          const end = asDayKey(pair[1], timeZone);
          return and(gte(col, start), lte(col, end));
        }
        default:
          break;
      }
    }
    return columnResolver({
      title: studioSessions.title,
      location: studioSessions.location,
      publicId: studioSessionOccurrences.publicId,
      category: studioSessions.category,
      published: studioSessions.published,
      occursOn: studioSessionOccurrences.occursOn,
    })(f);
  };
}

function classClock(value: unknown, timeZone: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return fromZonedClock(clockFrom(value, timeZone), timeZone);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{2}:\d{2}/.test(trimmed)) return fromZonedClock(trimmed, timeZone);
  }
  return fromZonedClock(clockFrom(toDate(value), timeZone), timeZone);
}

function normalizeClassWrite(input: Record<string, unknown>, timeZone?: string): Record<string, unknown> {
  const title = String(input.title ?? "").trim();
  if (!title) throw new ValidationError("Title is required.");
  if (!isSessionCategory(input.category)) throw new ValidationError("Pick a category.");
  const attendanceMode = input.attendanceMode ?? "either";
  if (!isAttendanceMode(attendanceMode)) throw new ValidationError("Pick stay, drop-off, or either.");
  const capacity = Number(input.capacity);
  if (!Number.isInteger(capacity) || capacity < 1) throw new ValidationError("Capacity must be at least 1.");
  const zone = timeZone ?? "UTC";
  const startsAt = classClock(input.startsAt, zone);
  const endsAt = classClock(input.endsAt, zone);
  if (endsAt.getTime() <= startsAt.getTime()) throw new ValidationError("End must be after start.");
  assertSameCalendarDay(startsAt, endsAt, zone);
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
    photos: parsePhotos(input.photos),
    weekdays: [],
    repeatsUntil: null,
  };
}

export { normalizeClassWrite };

function toDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  throw new ValidationError("Start and end times are required.");
}

function emptyToNull(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}
