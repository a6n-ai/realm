import { ValidationError } from "@foundry/commons";
import type { Condition, FilterCondition } from "@foundry/commons/model/condition";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { columnResolver, conditionToSql, pageOrder } from "@foundry/database";
import { and, asc, eq, gt, gte, inArray, isNotNull, lte, notExists, sql } from "drizzle-orm";
import { pushInAppNotification } from "@/lib/notifications/push";
import { db } from "@/db/client";
import { bookings, studioSessionOccurrences, studioSessions } from "@/db/schema";
import { ATTENDANCE_MODES, CLASS_BOOKING_TYPES, SESSION_CATEGORIES, type AttendanceMode, type SessionCategory } from "@/db/schema/studio";
import type { SortState } from "@/lib/list/sort";
import { CLASS_COLORS } from "@/lib/sessions/format";
import { expandPattern, maxWindowMinutes, type RepeatPattern } from "@/lib/sessions/pattern";
import { parsePhotos } from "@/lib/sessions/photos";
import { parseDay } from "@/lib/sessions/schedule";
import { addDayKey, dayKey, fromZonedLocal, toZonedLocal } from "@/lib/sessions/timezone";
import { DEFAULT_PRICE_TABLE } from "@/lib/pricing/defaults";
import { offeredLengths } from "@/lib/pricing/resolve";
import type { ClassPricing, PriceCell, PriceTable } from "@/lib/pricing/types";
import { getAppClock, getDefaultPrices } from "./app-settings.service";
import { bookingsService } from "./bookings.service";
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
  color: string;
  status: "scheduled" | "cancelled";
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

type Executor = Pick<typeof db, "select" | "insert" | "delete">;

const sameSet = (a: number[] | null, b: number[] | null) => {
  if (!a || !b) return a === b;
  const sb = [...b].sort((x, y) => x - y);
  return a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === sb[i]);
};

/** Structural compare: jsonb reorders object keys, so JSON.stringify never matches a stored pattern. */
export function samePattern(a: RepeatPattern | null, b: RepeatPattern | null): boolean {
  if (!a || !b) return a === b;
  return (
    sameSet(a.weekdays, b.weekdays) &&
    sameSet(a.nthOfMonth, b.nthOfMonth) &&
    sameSet(a.excludeMonths, b.excludeMonths) &&
    a.startClock === b.startClock &&
    a.endClock === b.endClock &&
    a.startsOn === b.startsOn &&
    (a.endsOn ?? null) === (b.endsOn ?? null)
  );
}

/** Thrown when an edit would cancel bookings and the caller has not confirmed. */
export class NeedsConfirmError extends ValidationError {}

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
    if ("pattern" in write && !samePattern((write.pattern ?? null) as RepeatPattern | null, before.pattern ?? null)) {
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

  /** Days `from`..`to` inclusive (YYYY-MM-DD). Materialises the horizon first so a pattern's days are there to show. */
  async listRange(from: string, to: string, opts: { publicOnly: boolean }): Promise<AdminOccurrence[]> {
    await this.ensureHorizon();
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
          gte(studioSessionOccurrences.occursOn, parseDay(from)),
          lte(studioSessionOccurrences.occursOn, parseDay(to)),
          opts.publicOnly
            ? and(
                eq(studioSessions.published, true),
                eq(studioSessions.bookingType, "bookable"),
                eq(studioSessionOccurrences.status, "scheduled"),
              )
            : undefined,
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
  async ensureHorizon(classPublicId?: string, exec: Executor = db): Promise<void> {
    const zone = await this.timezone();
    const today = dayKey(new Date(), zone);
    const horizon = addDayKey(today, HORIZON_DAYS);
    const classes = await exec
      .select()
      .from(studioSessions)
      .where(
        and(
          eq(studioSessions.archived, false),
          isNotNull(studioSessions.pattern),
          classPublicId ? eq(studioSessions.publicId, classPublicId) : undefined,
        ),
      );
    // The all-classes sweep runs on every calendar read, so skip classes already filled to their target end.
    // A targeted call (class save, regenerate) always expands: its gaps matter more than the saved write.
    const maxDay = new Map<bigint, string>();
    if (!classPublicId && classes.length > 0) {
      const maxes = await exec
        .select({ sessionId: studioSessionOccurrences.sessionId, last: sql<string>`max(${studioSessionOccurrences.occursOn})` })
        .from(studioSessionOccurrences)
        .where(inArray(studioSessionOccurrences.sessionId, classes.map((c) => c.id)))
        .groupBy(studioSessionOccurrences.sessionId);
      for (const m of maxes) maxDay.set(m.sessionId, m.last);
    }
    for (const klass of classes) {
      const pattern = klass.pattern;
      if (!pattern) continue;
      const last = maxDay.get(klass.id);
      const target = pattern.endsOn && pattern.endsOn < horizon ? pattern.endsOn : horizon;
      if (last && last >= target) continue;
      const rows = expandPattern(pattern, today, horizon).map((day) => ({
        sessionId: klass.id,
        occursOn: day,
        startsAt: fromZonedLocal(`${day}T${pattern.startClock}`, zone),
        endsAt: fromZonedLocal(`${day}T${pattern.endClock}`, zone),
        capacity: klass.capacity,
      }));
      if (rows.length === 0) continue;
      await exec
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
    const count = (x: Executor) =>
      x
        .select({ n: sql<number>`cast(count(*) as int)` })
        .from(studioSessionOccurrences)
        .where(eq(studioSessionOccurrences.sessionId, klass.id))
        .then(([r]) => r?.n ?? 0);
    return db.transaction(async (tx) => {
      const removed = await tx
        .delete(studioSessionOccurrences)
        .where(
          and(
            eq(studioSessionOccurrences.sessionId, klass.id),
            gt(studioSessionOccurrences.occursOn, today),
            eq(studioSessionOccurrences.edited, false),
            eq(studioSessionOccurrences.status, "scheduled"),
            notExists(tx.select({ one: sql`1` }).from(bookings).where(eq(bookings.occurrenceId, studioSessionOccurrences.id))),
          ),
        )
        .returning({ id: studioSessionOccurrences.id });
      const before = await count(tx);
      await this.ensureHorizon(classPublicId, tx);
      return { removed: removed.length, added: (await count(tx)) - before };
    });
  }

  /** Only untouched days can be removed; anything that ever had a booking must be cancelled so the history stays. */
  async unscheduleSession(occurrencePublicId: string): Promise<string> {
    const [occurrence] = await db
      .select()
      .from(studioSessionOccurrences)
      .where(eq(studioSessionOccurrences.publicId, occurrencePublicId))
      .limit(1);
    if (!occurrence) throw new ValidationError("Session not found.");
    const [booked] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.occurrenceId, occurrence.id)).limit(1);
    if (booked) throw new ValidationError(`${occurrence.occursOn} has bookings. Cancel the session instead of removing it.`);
    const [klass] = await db.select({ pattern: studioSessions.pattern }).from(studioSessions).where(eq(studioSessions.id, occurrence.sessionId)).limit(1);
    // A pattern day is cancelled, not deleted: a missing row would be re-materialised as a bookable session.
    if (klass?.pattern) await this.lockAndSet(occurrence.id, { status: "cancelled" });
    else await db.delete(studioSessionOccurrences).where(eq(studioSessionOccurrences.id, occurrence.id));
    return occurrence.occursOn;
  }

  private async loadOccurrence(publicId: string) {
    const [row] = await db
      .select({ occ: studioSessionOccurrences, klass: studioSessions })
      .from(studioSessionOccurrences)
      .innerJoin(studioSessions, eq(studioSessions.id, studioSessionOccurrences.sessionId))
      .where(eq(studioSessionOccurrences.publicId, publicId))
      .limit(1);
    if (!row) throw new ValidationError("Session not found.");
    return row;
  }

  /** What the session editor needs: this session's own prices, the class layers beneath it, and the class pricing shape. */
  async readPricing(publicId: string): Promise<{ prices: PriceTable; inherited: PriceTable; pricing: ClassPricing; cancelled: boolean }> {
    const { occ, klass } = await this.loadOccurrence(publicId);
    const global = await getDefaultPrices();
    const inherited: PriceTable = { ...global };
    for (const [k, v] of Object.entries(klass.prices ?? {})) inherited[k] = { ...global[k], ...v };
    return { prices: occ.prices ?? {}, inherited, pricing: klass.pricing, cancelled: occ.status === "cancelled" };
  }

  private reservedBookings(occurrenceId: bigint) {
    return db
      .select({ id: bookings.id, publicId: bookings.publicId, userId: bookings.userId, seats: bookings.seats, startsAt: bookings.startsAt, endsAt: bookings.endsAt })
      .from(bookings)
      .where(and(eq(bookings.occurrenceId, occurrenceId), inArray(bookings.status, [...RESERVED_BOOKING_STATUSES])));
  }

  /**
   * Cancel every live booking through the staff-cancel path (coins, payment) and tell each parent.
   * Runs after the session itself is flipped, so nothing new can be booked meanwhile. A booking that
   * was cancelled by someone else in the meantime counts as done; real failures are collected.
   */
  private async cancelBookingsAndNotify(
    occurrenceId: bigint,
    notice: { title: string; body: string },
    only: (b: { startsAt: Date; endsAt: Date }) => boolean = () => true,
  ): Promise<number> {
    const live = (await this.reservedBookings(occurrenceId)).filter(only);
    let done = 0;
    let failed = 0;
    for (const b of live) {
      try {
        await bookingsService.cancel(b.publicId);
      } catch (err) {
        if (err instanceof ValidationError && /already cancelled/.test(err.message)) continue;
        failed += 1;
        continue;
      }
      done += 1;
      await pushInAppNotification({ userId: b.userId, ...notice });
    }
    if (failed > 0) throw new ValidationError(`${failed} of ${live.length} bookings could not be cancelled. Retry to finish.`);
    return done;
  }

  private async lockAndSet(occurrenceId: bigint, set: Partial<typeof studioSessionOccurrences.$inferInsert>) {
    const actorId = await currentUserId();
    await db.transaction(async (tx) => {
      await tx.select({ id: studioSessionOccurrences.id }).from(studioSessionOccurrences).where(eq(studioSessionOccurrences.id, occurrenceId)).for("update");
      await tx.update(studioSessionOccurrences).set({ ...set, edited: true, updatedBy: actorId }).where(eq(studioSessionOccurrences.id, occurrenceId));
    });
  }

  async cancelSession(publicId: string, opts: { confirm: boolean }): Promise<{ cancelledBookings: number }> {
    const { occ, klass } = await this.loadOccurrence(publicId);
    const live = await this.reservedBookings(occ.id);
    // Already cancelled: finish an interrupted cancel by clearing whatever is still reserved.
    if (occ.status === "cancelled" && live.length === 0) return { cancelledBookings: 0 };
    if (live.length > 0 && !opts.confirm) {
      throw new ValidationError(`${live.length} booking${live.length === 1 ? "" : "s"} will be cancelled. Confirm to continue.`);
    }
    if (occ.status !== "cancelled") await this.lockAndSet(occ.id, { status: "cancelled" });
    const cancelledBookings = await this.cancelBookingsAndNotify(occ.id, {
      title: "Session cancelled",
      body: `${klass.title} on ${occ.occursOn} has been cancelled.`,
    });
    return { cancelledBookings };
  }

  async updateSession(
    publicId: string,
    input: {
      startsAt?: Date;
      endsAt?: Date;
      occursOn?: string;
      capacity?: number;
      prices?: PriceTable | null;
      confirm?: boolean;
    },
  ): Promise<void> {
    const { occ, klass } = await this.loadOccurrence(publicId);
    if (occ.status === "cancelled") throw new ValidationError("A cancelled session can't be edited.");
    const zone = await this.timezone();
    const occursOn = input.occursOn === undefined ? occ.occursOn : parseDay(input.occursOn);
    const shift = (d: Date) => fromZonedLocal(`${occursOn}T${toZonedLocal(d, zone).slice(11)}`, zone);
    const startsAt = input.startsAt ?? (occursOn === occ.occursOn ? occ.startsAt : shift(occ.startsAt));
    const endsAt = input.endsAt ?? (occursOn === occ.occursOn ? occ.endsAt : shift(occ.endsAt));
    if (endsAt <= startsAt) throw new ValidationError("A session must end after it starts.");
    const capacity = input.capacity ?? occ.capacity;
    if (!Number.isInteger(capacity) || capacity < 1) throw new ValidationError("Capacity must be at least 1.");

    const live = await this.reservedBookings(occ.id);
    const booked = live.reduce((n, b) => n + b.seats, 0);
    if (capacity < booked) throw new ValidationError(`${booked} children are already booked; capacity can't go below that.`);

    const minute = (d: Date) => Math.floor(d.getTime() / 60_000);
    const moved = occursOn !== occ.occursOn || minute(startsAt) !== minute(occ.startsAt) || minute(endsAt) !== minute(occ.endsAt);
    // A booking outside the current window is left over from an interrupted move; a retry finishes it.
    const outside = (b: { startsAt: Date; endsAt: Date }) => b.startsAt < startsAt || b.endsAt > endsAt;
    const toCancel = moved ? live : live.filter(outside);
    if (toCancel.length > 0 && !input.confirm) {
      throw new NeedsConfirmError(`Moving this session cancels ${toCancel.length} booking${toCancel.length === 1 ? "" : "s"}. Confirm to continue.`);
    }
    if (occursOn !== occ.occursOn) {
      const [clash] = await db
        .select({ id: studioSessionOccurrences.id })
        .from(studioSessionOccurrences)
        .where(and(eq(studioSessionOccurrences.sessionId, klass.id), eq(studioSessionOccurrences.occursOn, occursOn)))
        .limit(1);
      if (clash) throw new ValidationError("This class is already scheduled that day.");
    }

    let prices = occ.prices;
    if (input.prices !== undefined) {
      const windowMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
      const normalized =
        input.prices === null ? null : normalizePrices(input.prices, klass.pricing, await getDefaultPrices(), windowMinutes);
      prices = normalized && Object.keys(normalized).length > 0 ? normalized : null;
    }

    await this.lockAndSet(occ.id, { occursOn, startsAt, endsAt, capacity, prices });
    if (occursOn !== occ.occursOn && klass.pattern) {
      // Placeholder on the vacated day so the pattern doesn't re-create it. The moved row already took the new date, so the unique index holds.
      const actorId = await currentUserId();
      await db
        .insert(studioSessionOccurrences)
        .values({
          sessionId: klass.id,
          occursOn: occ.occursOn,
          startsAt: occ.startsAt,
          endsAt: occ.endsAt,
          capacity: occ.capacity,
          status: "cancelled",
          edited: true,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .onConflictDoNothing({ target: [studioSessionOccurrences.sessionId, studioSessionOccurrences.occursOn] });
    }
    if (toCancel.length > 0) {
      await this.cancelBookingsAndNotify(
        occ.id,
        { title: "Session moved", body: `${klass.title} on ${occ.occursOn} has moved. Please book the new time.` },
        moved ? undefined : outside,
      );
    }
  }

  /** Copy the scheduled days of the week starting `fromMonday` onto `toMonday`, keeping clock times. Days the class already has are skipped. */
  async copyWeek(fromMonday: string, toMonday: string): Promise<{ copied: number }> {
    const from = parseDay(fromMonday);
    const to = parseDay(toMonday);
    const toMs = (k: string) => Date.parse(`${k}T00:00:00Z`);
    const offset = Math.round((toMs(to) - toMs(from)) / 86_400_000);
    if (offset === 0) throw new ValidationError("Pick a different week to copy into.");
    const zone = await this.timezone();
    const actorId = await currentUserId();
    const source = await db
      .select({ occ: studioSessionOccurrences })
      .from(studioSessionOccurrences)
      .innerJoin(studioSessions, eq(studioSessions.id, studioSessionOccurrences.sessionId))
      .where(
        and(
          gte(studioSessionOccurrences.occursOn, from),
          lte(studioSessionOccurrences.occursOn, addDayKey(from, 6)),
          eq(studioSessionOccurrences.status, "scheduled"),
          eq(studioSessions.archived, false),
        ),
      );
    let copied = 0;
    for (const { occ } of source) {
      const day = addDayKey(occ.occursOn, offset);
      const made = await db
        .insert(studioSessionOccurrences)
        .values({
          sessionId: occ.sessionId,
          occursOn: day,
          startsAt: fromZonedLocal(`${day}T${toZonedLocal(occ.startsAt, zone).slice(11)}`, zone),
          endsAt: fromZonedLocal(`${day}T${toZonedLocal(occ.endsAt, zone).slice(11)}`, zone),
          capacity: occ.capacity,
          prices: occ.prices,
          edited: true,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .onConflictDoNothing({ target: [studioSessionOccurrences.sessionId, studioSessionOccurrences.occursOn] })
        .returning({ id: studioSessionOccurrences.id });
      copied += made.length;
    }
    return { copied };
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
          eq(studioSessions.bookingType, "bookable"),
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
    if (row.occurrence.status !== "scheduled") throw new ValidationError("This session is not open for booking.");
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

type OccurrenceFields = { publicId: string; occursOn: string; startsAt: Date; endsAt: Date; capacity: number; status: "scheduled" | "cancelled" };

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
    color: session.color,
    status: occurrence.status,
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
