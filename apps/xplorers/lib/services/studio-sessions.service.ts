import { ValidationError } from "@foundry/commons";
import type { Condition, FilterCondition } from "@foundry/commons/model/condition";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { columnResolver, conditionToSql, pageOrder } from "@foundry/database";
import { and, asc, eq, gt, gte, inArray, isNotNull, lte, notExists, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { bookings, studioSessionOccurrences, studioSessions } from "@/db/schema";
import { ATTENDANCE_MODES, CLASS_BOOKING_TYPES, SESSION_CATEGORIES, type AttendanceMode, type SessionCategory } from "@/db/schema/studio";
import type { SortState } from "@/lib/list/sort";
import { monthGrid } from "@/lib/sessions/calendar";
import { CLASS_COLORS } from "@/lib/sessions/format";
import { expandPattern, maxWindowMinutes, type RepeatPattern } from "@/lib/sessions/pattern";
import { parsePhotos } from "@/lib/sessions/photos";
import { parseDay } from "@/lib/sessions/schedule";
import { addDayKey, dayKey, fromZonedLocal } from "@/lib/sessions/timezone";
import { DEFAULT_PRICE_TABLE } from "@/lib/pricing/defaults";
import { offeredLengths } from "@/lib/pricing/resolve";
import type { ClassPricing, PriceCell, PriceTable } from "@/lib/pricing/types";
import { getAppClock, getDefaultPrices } from "./app-settings.service";
import { remainingSeats, isPubliclyListed, RESERVED_BOOKING_STATUSES } from "./booking-policy";
import { currentUserId, SessionUpdatableService } from "./session-service";
import { studioSessionsRepository, type StudioSessionRow } from "./studio-sessions.repository";

export { ATTENDANCE_MODES, SESSION_CATEGORIES, type AttendanceMode, type SessionCategory };

export type PublicSession = StudioSessionRow & {
  startsAt: Date;
  endsAt: Date;
  remaining: number;
  occurrencePublicId: string;
  occursOn: string;
};

export type ClassSortColumn = "title" | "category" | "capacity" | "published" | "createdAt";
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
  scheduleLine: string | null;
};

const CLASS_SORT = {
  title: studioSessions.title,
  category: studioSessions.category,
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

const HORIZON_DAYS = 92;

const confirmedAgg = db
  .select({
    occurrenceId: bookings.occurrenceId,
    seats: sql<number>`coalesce(sum(${bookings.seats}), 0)`.as("seats"),
  })
  .from(bookings)
  .where(inArray(bookings.status, [...RESERVED_BOOKING_STATUSES]))
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

const EMPTY_PRICING: ClassPricing = {
  mode: "length",
  defaultLengthMinutes: 60,
  options: [],
  extension: null,
  adults: { free: 0, extraPrice: null },
};

class StudioSessionsService extends SessionUpdatableService<typeof studioSessions> {
  async createClass(input: Record<string, unknown>): Promise<StudioSessionRow> {
    const write = normalizeClassWrite(input, await getDefaultPrices());
    const row = await this.create({ pricing: EMPTY_PRICING, ...write });
    if (write.pattern) await this.ensureHorizon(row.publicId);
    return row;
  }

  async updateClass(publicId: string, input: Record<string, unknown>): Promise<StudioSessionRow> {
    const write = normalizeClassWrite(input, await getDefaultPrices());
    const before = await this.read(publicId);
    const row = await this.update(publicId, write);
    if ("pattern" in write && JSON.stringify(write.pattern ?? null) !== JSON.stringify(before.pattern ?? null)) {
      await this.regenerateFuture(publicId);
    }
    return row;
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
    const order = pageOrder(sort.dir, col, studioSessions.id);

    const [items, [{ count }]] = await Promise.all([
      db
        .select({
          session: studioSessions,
          sessionCount: sessionCountAgg.n,
        })
        .from(studioSessions)
        .leftJoin(sessionCountAgg, eq(sessionCountAgg.sessionId, studioSessions.id))
        .where(where)
        .orderBy(...order)
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
    const order = pageOrder(sort.dir, col, studioSessionOccurrences.id);

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
        .orderBy(order[0], asc(studioSessionOccurrences.startsAt), order[1])
        .limit(page.size)
        .offset(page.page * page.size),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(studioSessionOccurrences)
        .innerJoin(studioSessions, eq(studioSessions.id, studioSessionOccurrences.sessionId))
        .where(where),
    ]);

    return {
      items: items.map((row) => toAdminOccurrence(row.session, row.occurrence, row.confirmed)),
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
      .orderBy(asc(studioSessionOccurrences.occursOn), asc(studioSessionOccurrences.startsAt));
    return rows.map((row) => toAdminOccurrence(row.session, row.occurrence, row.confirmed));
  }

  async listClassOptions(): Promise<ClassOption[]> {
    const rows = await db
      .select({
        publicId: studioSessions.publicId,
        title: studioSessions.title,
        capacity: studioSessions.capacity,
        scheduleLine: studioSessions.scheduleLine,
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
    return toAdminOccurrence(row.session, row.occurrence, row.confirmed);
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
    const zone = await this.timezone();
    // ponytail: Task 6 schedules from the class pattern; until then fall back to a fixed hour.
    const startsAt = fromZonedLocal(`${day}T${klass.pattern?.startClock ?? "10:00"}`, zone);
    const endsAt = fromZonedLocal(`${day}T${klass.pattern?.endClock ?? "11:00"}`, zone);
    const [row] = await db
      .insert(studioSessionOccurrences)
      .values({
        sessionId: klass.id,
        occursOn: day,
        startsAt,
        endsAt,
        capacity: klass.capacity,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning({ publicId: studioSessionOccurrences.publicId, occursOn: studioSessionOccurrences.occursOn });
    if (!row) throw new ValidationError("Could not schedule the session.");
    return row;
  }

  /**
   * Materialise sessions from today to min(endsOn, today + HORIZON_DAYS). Existing rows (including
   * cancelled ones) win the conflict, so a cancelled day is never recreated.
   */
  async ensureHorizon(classPublicId?: string): Promise<void> {
    const zone = await this.timezone();
    const today = dayKey(new Date(), zone);
    const horizon = addDayKey(today, HORIZON_DAYS);
    const classes = await db
      .select()
      .from(studioSessions)
      .where(
        and(
          eq(studioSessions.archived, false),
          isNotNull(studioSessions.pattern),
          classPublicId ? eq(studioSessions.publicId, classPublicId) : undefined,
        ),
      );
    for (const klass of classes) {
      const pattern = klass.pattern;
      if (!pattern) continue;
      const rows = expandPattern(pattern, today, horizon).map((day) => ({
        sessionId: klass.id,
        occursOn: day,
        startsAt: fromZonedLocal(`${day}T${pattern.startClock}`, zone),
        endsAt: fromZonedLocal(`${day}T${pattern.endClock}`, zone),
        capacity: klass.capacity,
      }));
      if (rows.length === 0) continue;
      await db
        .insert(studioSessionOccurrences)
        .values(rows)
        .onConflictDoNothing({ target: [studioSessionOccurrences.sessionId, studioSessionOccurrences.occursOn] });
    }
  }

  /** Drop untouched future sessions (strictly after today; today is left alone) and re-expand the pattern. */
  async regenerateFuture(classPublicId: string): Promise<{ removed: number; added: number }> {
    const zone = await this.timezone();
    const today = dayKey(new Date(), zone);
    const [klass] = await db
      .select({ id: studioSessions.id })
      .from(studioSessions)
      .where(eq(studioSessions.publicId, classPublicId))
      .limit(1);
    if (!klass) throw new ValidationError("Class not found.");
    const count = () =>
      db
        .select({ n: sql<number>`cast(count(*) as int)` })
        .from(studioSessionOccurrences)
        .where(eq(studioSessionOccurrences.sessionId, klass.id))
        .then(([r]) => r?.n ?? 0);
    const removed = await db
      .delete(studioSessionOccurrences)
      .where(
        and(
          eq(studioSessionOccurrences.sessionId, klass.id),
          gt(studioSessionOccurrences.occursOn, today),
          eq(studioSessionOccurrences.edited, false),
          eq(studioSessionOccurrences.status, "scheduled"),
          notExists(db.select({ one: sql`1` }).from(bookings).where(eq(bookings.occurrenceId, studioSessionOccurrences.id))),
        ),
      )
      .returning({ id: studioSessionOccurrences.id });
    const before = await count();
    await this.ensureHorizon(classPublicId);
    return { removed: removed.length, added: (await count()) - before };
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
      .where(and(eq(bookings.occurrenceId, occurrence.id), inArray(bookings.status, [...RESERVED_BOOKING_STATUSES])))
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
      .where(
        and(
          eq(studioSessions.published, true),
          eq(studioSessions.archived, false),
          eq(studioSessionOccurrences.status, "scheduled"),
        ),
      )
      .orderBy(asc(studioSessionOccurrences.occursOn), asc(studioSessionOccurrences.startsAt));
    return rows
      .map(({ session, occurrence, confirmed }) => toPublicSession(session, occurrence, confirmed))
      .filter((session) => isPubliclyListed(session, now));
  }

  /** Published, non-archived classes for the public Classes pages, dates or not. */
  listPublicClasses(): Promise<Array<typeof studioSessions.$inferSelect>> {
    return db
      .select()
      .from(studioSessions)
      .where(and(eq(studioSessions.published, true), eq(studioSessions.archived, false)))
      .orderBy(asc(studioSessions.sortOrder), asc(studioSessions.title));
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
    const listed = toPublicSession(row.session, row.occurrence, row.confirmed);
    if (!isPubliclyListed(listed, now)) throw new ValidationError("This session is not open for booking.");
    return listed;
  }

  async timezone(): Promise<string> {
    const { timezone } = await getAppClock();
    return timezone;
  }
}

export const studioSessionsService = new StudioSessionsService(studioSessionsRepository);

type OccurrenceFields = { publicId: string; occursOn: string; startsAt: Date; endsAt: Date; capacity: number };

function toPublicSession(
  session: StudioSessionRow,
  occurrence: OccurrenceFields,
  confirmed: number | null,
): PublicSession {
  return {
    ...session,
    occurrencePublicId: occurrence.publicId,
    occursOn: occurrence.occursOn,
    startsAt: occurrence.startsAt,
    endsAt: occurrence.endsAt,
    capacity: occurrence.capacity,
    remaining: remainingSeats(occurrence.capacity, Number(confirmed ?? 0)),
  };
}

function toAdminOccurrence(
  session: StudioSessionRow,
  occurrence: OccurrenceFields,
  confirmed: number | null,
): AdminOccurrence {
  return {
    publicId: occurrence.publicId,
    classPublicId: session.publicId,
    title: session.title,
    category: session.category,
    occursOn: occurrence.occursOn,
    startsAt: occurrence.startsAt,
    endsAt: occurrence.endsAt,
    capacity: occurrence.capacity,
    remaining: remainingSeats(occurrence.capacity, Number(confirmed ?? 0)),
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

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function asObject(value: unknown): Record<string, unknown> | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    if (!value.trim()) return null;
    try {
      value = JSON.parse(value);
    } catch {
      throw new ValidationError("Could not read the class settings.");
    }
  }
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new ValidationError("Could not read the class settings.");
  return value as Record<string, unknown>;
}

function intIn(value: unknown, min: number, max: number, label: string): number {
  const n = Number(value);
  if (value === "" || value === null || !Number.isInteger(n) || n < min || n > max) {
    throw new ValidationError(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

function cell(value: unknown, label: string): PriceCell {
  const raw = (value ?? {}) as Record<string, unknown>;
  const out: PriceCell = {};
  for (const day of ["weekday", "weekend"] as const) {
    if (raw[day] === undefined || raw[day] === null) continue;
    const n = Number(raw[day]);
    if (!Number.isFinite(n) || n < 0) throw new ValidationError(`${label} must be zero or more.`);
    out[day] = n;
  }
  return out;
}

function normalizePattern(raw: Record<string, unknown>): RepeatPattern {
  const weekdays = [...new Set(((raw.weekdays as unknown[]) ?? []).map((d) => intIn(d, 1, 7, "Weekday")))].sort();
  if (weekdays.length === 0) throw new ValidationError("Pick at least one weekday for the repeat pattern.");
  const nth = raw.nthOfMonth as unknown[] | null | undefined;
  const nthOfMonth = nth && nth.length ? [...new Set(nth.map((d) => intIn(d, 1, 5, "Week of month")))].sort() : null;
  const startClock = String(raw.startClock ?? "");
  const endClock = String(raw.endClock ?? "");
  if (!CLOCK.test(startClock) || !CLOCK.test(endClock)) throw new ValidationError("Set a start and end time.");
  if (endClock <= startClock) throw new ValidationError("The end time must be after the start time.");
  const startsOn = String(raw.startsOn ?? "");
  if (!DAY.test(startsOn)) throw new ValidationError("Set the day the pattern starts.");
  const endsOn = raw.endsOn ? String(raw.endsOn) : null;
  if (endsOn && (!DAY.test(endsOn) || endsOn < startsOn)) throw new ValidationError("The end day must be on or after the start day.");
  const excludeMonths = [...new Set(((raw.excludeMonths as unknown[]) ?? []).map((m) => intIn(m, 1, 12, "Month")))].sort(
    (a, b) => a - b,
  );
  return { weekdays, nthOfMonth, startClock, endClock, startsOn, endsOn, excludeMonths };
}

function normalizePricing(raw: Record<string, unknown>, window: number): ClassPricing {
  const mode = raw.mode;
  if (mode !== "length" && mode !== "options") throw new ValidationError("Pick a pricing mode.");
  const defaultLengthMinutes = intIn(raw.defaultLengthMinutes, 30, 24 * 60, "Default length");
  if (defaultLengthMinutes % 30 !== 0) throw new ValidationError("Default length must be a multiple of 30 minutes.");
  const options = ((raw.options as Record<string, unknown>[]) ?? []).map((o) => {
    const key = String(o.key ?? "");
    if (!SLUG.test(key)) throw new ValidationError(`Option key "${key}" must be lowercase letters, numbers and hyphens.`);
    const label = String(o.label ?? "").trim();
    if (!label) throw new ValidationError("Every option needs a name.");
    const lengthMinutes = intIn(o.lengthMinutes, 30, 24 * 60, "Option length");
    if (lengthMinutes % 30 !== 0) throw new ValidationError("Option length must be a multiple of 30 minutes.");
    if (lengthMinutes > window) throw new ValidationError(`Option "${label}" is longer than the session window.`);
    return { key, label, lengthMinutes, adultsIncluded: intIn(o.adultsIncluded ?? 0, 0, 20, "Adults included") };
  });
  if (new Set(options.map((o) => o.key)).size !== options.length) throw new ValidationError("Option keys must be unique.");
  if (mode === "options" && options.length === 0) throw new ValidationError("Add at least one option.");
  const ext = raw.extension as Record<string, unknown> | null | undefined;
  let extension: ClassPricing["extension"] = null;
  if (ext) {
    const stepMinutes = Number(ext.stepMinutes);
    if (stepMinutes !== 30 && stepMinutes !== 60) throw new ValidationError("Extension steps are 30 or 60 minutes.");
    extension = { stepMinutes, price: cell(ext.price, "Extension price") };
  }
  const ad = (raw.adults ?? {}) as Record<string, unknown>;
  const adults = {
    free: intIn(ad.free ?? 0, 0, 20, "Free adults"),
    extraPrice: ad.extraPrice ? cell(ad.extraPrice, "Extra adult price") : null,
  };
  return { mode, defaultLengthMinutes, options: mode === "options" ? options : [], extension, adults };
}

function normalizePrices(raw: Record<string, unknown>, pricing: ClassPricing, globalTable: PriceTable, window: number) {
  const lengths = new Set(offeredLengths(pricing, globalTable, window));
  const out: PriceTable = {};
  for (const [key, value] of Object.entries(raw)) {
    const ok = key.startsWith("len:")
      ? pricing.mode === "length" && lengths.has(Number(key.slice(4)))
      : key.startsWith("opt:")
        ? pricing.options.some((o) => `opt:${o.key}` === key)
        : key === "ext" && pricing.extension !== null;
    if (!ok) throw new ValidationError(`Price "${key}" does not match anything this class offers.`);
    const c = cell(value, key);
    if (c.weekday !== undefined || c.weekend !== undefined) out[key] = c;
  }
  return out;
}

/**
 * Pure validation of a class write. `globalPrices` is the studio default table (callers pass the live one).
 * With no pattern the window is unknown, so lengths are not capped.
 */
function normalizeClassWrite(
  input: Record<string, unknown>,
  globalPrices: PriceTable = DEFAULT_PRICE_TABLE,
): Record<string, unknown> {
  const title = String(input.title ?? "").trim();
  if (!title) throw new ValidationError("Title is required.");
  if (!isSessionCategory(input.category)) throw new ValidationError("Pick a category.");
  const attendanceMode = input.attendanceMode ?? "either";
  if (!isAttendanceMode(attendanceMode)) throw new ValidationError("Pick stay, drop-off, or either.");
  const capacity = Number(input.capacity);
  if (!Number.isInteger(capacity) || capacity < 1) throw new ValidationError("Capacity must be at least 1.");

  const out: Record<string, unknown> = {
    title,
    category: input.category,
    summary: emptyToNull(input.description) ?? "",
    capacity,
    location: emptyToNull(input.location),
    attendanceMode,
    published: input.published === true || input.published === "on" || input.published === "true",
    photos: parsePhotos(input.photos),
  };

  if (input.included !== undefined) out.included = emptyToNull(input.included);
  if (input.scheduleLine !== undefined) out.scheduleLine = emptyToNull(input.scheduleLine);
  if (input.groupSize !== undefined) out.groupSize = emptyToNull(input.groupSize);
  if (input.ageWaiver !== undefined) {
    out.ageWaiver = input.ageWaiver === true || input.ageWaiver === "on" || input.ageWaiver === "true";
  }
  if (input.ageMin !== undefined || input.ageMax !== undefined) {
    const blank = (v: unknown) => v === undefined || v === null || v === "";
    const ageMin = blank(input.ageMin) ? null : intIn(input.ageMin, 0, 99, "Minimum age");
    const ageMax = blank(input.ageMax) ? null : intIn(input.ageMax, 0, 99, "Maximum age");
    if (ageMin !== null && ageMax !== null && ageMin > ageMax) throw new ValidationError("Minimum age cannot be above the maximum age.");
    out.ageMin = ageMin;
    out.ageMax = ageMax;
  }
  if (input.color !== undefined) {
    if (!(CLASS_COLORS as readonly unknown[]).includes(input.color)) throw new ValidationError("Pick a colour from the list.");
    out.color = input.color;
  }
  const bookingType = input.bookingType ?? "bookable";
  if (!(CLASS_BOOKING_TYPES as readonly unknown[]).includes(bookingType)) {
    throw new ValidationError("Pick a booking type: bookable or enquire only.");
  }
  out.bookingType = bookingType;

  const rawPattern = asObject(input.pattern);
  const pattern = rawPattern ? normalizePattern(rawPattern) : rawPattern;
  if (pattern !== undefined) out.pattern = pattern;
  const window = pattern ? maxWindowMinutes(pattern) : Number.POSITIVE_INFINITY;

  if (bookingType === "enquire_only") {
    out.pricing = EMPTY_PRICING;
    out.prices = null;
    return out;
  }
  const rawPricing = asObject(input.pricing);
  if (rawPricing) {
    const pricing = normalizePricing(rawPricing, window);
    out.pricing = pricing;
    const rawPrices = asObject(input.prices);
    if (rawPrices !== undefined) out.prices = rawPrices ? normalizePrices(rawPrices, pricing, globalPrices, window) : null;
  }
  return out;
}

export { normalizeClassWrite };

function emptyToNull(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}
