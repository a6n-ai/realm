import { ValidationError } from "@foundry/commons";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { app, bookings, studioSessionOccurrences, studioSessions, users } from "@/db/schema";
import { occurrenceStartsAt } from "@/lib/sessions/schedule";
import { assertCanBook, remainingSeats } from "./booking-policy";
import { currentUserId, recordAudit, SessionUpdatableService } from "./session-service";
import { bookingsRepository, type BookingRow } from "./bookings.repository";

class BookingsService extends SessionUpdatableService<typeof bookings> {
  async createForUser(userPublicId: string, occurrencePublicId: string, seats: number): Promise<BookingRow> {
    const actorId = await currentUserId();
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId)).limit(1);
    if (!user) throw new ValidationError("Sign in to book.");

    const booking = await db.transaction(async (tx) => {
      const [occurrence] = await tx
        .select()
        .from(studioSessionOccurrences)
        .where(eq(studioSessionOccurrences.publicId, occurrencePublicId))
        .for("update")
        .limit(1);
      if (!occurrence) throw new ValidationError("Session not found.");

      const [session] = await tx
        .select()
        .from(studioSessions)
        .where(eq(studioSessions.id, occurrence.sessionId))
        .for("update")
        .limit(1);
      if (!session) throw new ValidationError("Session not found.");

      const [appRow] = await tx.select({ timezone: app.timezone }).from(app).limit(1);
      const timeZone = appRow?.timezone ?? "Asia/Singapore";
      const now = new Date();
      const startsAt = occurrenceStartsAt(occurrence.occursOn, session.startsAt, timeZone);

      const [existing] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(eq(bookings.occurrenceId, occurrence.id), eq(bookings.userId, user.id), eq(bookings.status, "confirmed")),
        )
        .limit(1);
      if (existing) throw new ValidationError("You've already booked this class on that day.");

      const [sum] = await tx
        .select({ seats: sql<number>`coalesce(sum(${bookings.seats}), 0)` })
        .from(bookings)
        .where(and(eq(bookings.occurrenceId, occurrence.id), eq(bookings.status, "confirmed")));

      assertCanBook({
        published: session.published,
        archived: session.archived,
        startsAt,
        now,
        remaining: remainingSeats(session.capacity, Number(sum?.seats ?? 0)),
        seats,
      });

      const [row] = await tx
        .insert(bookings)
        .values({
          sessionId: session.id,
          occurrenceId: occurrence.id,
          userId: user.id,
          seats,
          status: "confirmed",
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning();
      if (!row) throw new ValidationError("Could not save the booking.");
      return row;
    });

    await recordAudit({
      entity: "bookings",
      entityPublicId: booking.publicId,
      operation: "create",
      changes: { occurrencePublicId, seats, status: "confirmed" },
      createdBy: actorId,
    });
    return booking;
  }

  async listForUser(userPublicId: string): Promise<Array<BookingRow & { sessionTitle: string; startsAt: Date }>> {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId)).limit(1);
    if (!user) return [];
    const [appRow] = await db.select({ timezone: app.timezone }).from(app).limit(1);
    const timeZone = appRow?.timezone ?? "Asia/Singapore";
    const rows = await db
      .select({
        booking: bookings,
        sessionTitle: studioSessions.title,
        sessionStartsAt: studioSessions.startsAt,
        occursOn: studioSessionOccurrences.occursOn,
      })
      .from(bookings)
      .innerJoin(studioSessions, eq(studioSessions.id, bookings.sessionId))
      .innerJoin(studioSessionOccurrences, eq(studioSessionOccurrences.id, bookings.occurrenceId))
      .where(eq(bookings.userId, user.id))
      .orderBy(desc(studioSessionOccurrences.occursOn));
    return rows.map(({ booking, sessionTitle, sessionStartsAt, occursOn }) => ({
      ...booking,
      sessionTitle,
      startsAt: occurrenceStartsAt(occursOn, sessionStartsAt, timeZone),
    }));
  }

  async listConfirmedOccurrencePublicIds(userPublicId: string): Promise<string[]> {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId)).limit(1);
    if (!user) return [];
    const rows = await db
      .select({ publicId: studioSessionOccurrences.publicId })
      .from(bookings)
      .innerJoin(studioSessionOccurrences, eq(studioSessionOccurrences.id, bookings.occurrenceId))
      .where(and(eq(bookings.userId, user.id), eq(bookings.status, "confirmed")));
    return rows.map((row) => row.publicId);
  }
}

export const bookingsService = new BookingsService(bookingsRepository);
