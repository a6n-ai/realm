import { ValidationError } from "@foundry/commons";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { bookings, studioSessions, users } from "@/db/schema";
import { assertCanBook, remainingSeats } from "./booking-policy";
import { currentUserId, recordAudit, SessionUpdatableService } from "./session-service";
import { bookingsRepository, type BookingRow } from "./bookings.repository";

class BookingsService extends SessionUpdatableService<typeof bookings> {
  async createForUser(userPublicId: string, sessionPublicId: string, seats: number): Promise<BookingRow> {
    const actorId = await currentUserId();
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId)).limit(1);
    if (!user) throw new ValidationError("Sign in to book.");

    const booking = await db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(studioSessions)
        .where(eq(studioSessions.publicId, sessionPublicId))
        .for("update")
        .limit(1);
      if (!session) throw new ValidationError("Session not found.");

      const [sum] = await tx
        .select({ seats: sql<number>`coalesce(sum(${bookings.seats}), 0)` })
        .from(bookings)
        .where(and(eq(bookings.sessionId, session.id), eq(bookings.status, "confirmed")));

      assertCanBook({
        published: session.published,
        archived: session.archived,
        startsAt: session.startsAt,
        now: new Date(),
        remaining: remainingSeats(session.capacity, Number(sum?.seats ?? 0)),
        seats,
      });

      const [row] = await tx
        .insert(bookings)
        .values({
          sessionId: session.id,
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
      changes: { sessionPublicId, seats, status: "confirmed" },
      createdBy: actorId,
    });
    return booking;
  }

  async listForUser(userPublicId: string): Promise<Array<BookingRow & { sessionTitle: string; startsAt: Date }>> {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId)).limit(1);
    if (!user) return [];
    const rows = await db
      .select({ booking: bookings, sessionTitle: studioSessions.title, startsAt: studioSessions.startsAt })
      .from(bookings)
      .innerJoin(studioSessions, eq(studioSessions.id, bookings.sessionId))
      .where(eq(bookings.userId, user.id))
      .orderBy(desc(studioSessions.startsAt));
    return rows.map(({ booking, sessionTitle, startsAt }) => ({ ...booking, sessionTitle, startsAt }));
  }
}

export const bookingsService = new BookingsService(bookingsRepository);
