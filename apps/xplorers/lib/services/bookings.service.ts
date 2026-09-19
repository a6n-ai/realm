import { ValidationError } from "@foundry/commons";
import { findMethod, providerFor } from "@foundry/payments";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { bookings, payments, studioSessionOccurrences, studioSessions, users } from "@/db/schema";
import { occurrenceStartsAt } from "@/lib/sessions/schedule";
import { getAppClock, getPaymentConfig } from "./app-settings.service";
import { assertCanBook, remainingSeats, RESERVED_BOOKING_STATUSES } from "./booking-policy";
import { quoteBooking, paymentsService } from "./payments.service";
import { currentUserId, recordAudit, SessionUpdatableService } from "./session-service";
import { bookingsRepository, type BookingRow } from "./bookings.repository";

export type CreateBookingResult = BookingRow & { paymentPublicId: string | null };

class BookingsService extends SessionUpdatableService<typeof bookings> {
  async createForUser(
    userPublicId: string,
    occurrencePublicId: string,
    seats: number,
    methodId?: string,
  ): Promise<CreateBookingResult> {
    const actorId = await currentUserId();
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId)).limit(1);
    if (!user) throw new ValidationError("Sign in to book.");

    const rails = await paymentsService.enabledRails();
    const { timezone, currency } = await getAppClock();
    const cfg = await getPaymentConfig();

    const { booking, paymentPublicId } = await db.transaction(async (tx) => {
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

      const now = new Date();
      const startsAt = occurrenceStartsAt(occurrence.occursOn, session.startsAt, timezone);

      const [existing] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.occurrenceId, occurrence.id),
            eq(bookings.userId, user.id),
            inArray(bookings.status, [...RESERVED_BOOKING_STATUSES]),
          ),
        )
        .limit(1);
      if (existing) throw new ValidationError("You've already booked this class on that day.");

      const [sum] = await tx
        .select({ seats: sql<number>`coalesce(sum(${bookings.seats}), 0)` })
        .from(bookings)
        .where(and(eq(bookings.occurrenceId, occurrence.id), inArray(bookings.status, [...RESERVED_BOOKING_STATUSES])));

      assertCanBook({
        published: session.published,
        archived: session.archived,
        startsAt,
        now,
        remaining: remainingSeats(session.capacity, Number(sum?.seats ?? 0)),
        seats,
      });

      const unit = Number(session.priceAmount);
      const needsPay = rails.length > 0 && Number.isFinite(unit) && unit > 0;
      const method = needsPay
        ? findMethod(cfg, methodId ?? rails[0]!.id) ?? rails.find((r) => r.enabled) ?? rails[0]
        : undefined;
      if (needsPay && !method?.enabled) throw new ValidationError("No payment method is enabled.");

      const [row] = await tx
        .insert(bookings)
        .values({
          sessionId: session.id,
          occurrenceId: occurrence.id,
          userId: user.id,
          seats,
          status: needsPay ? "pending" : "confirmed",
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning();
      if (!row) throw new ValidationError("Could not save the booking.");

      if (!needsPay || !method) return { booking: row, paymentPublicId: null as string | null };

      const { total } = quoteBooking(session.priceAmount, seats, method);
      const initiated = providerFor(method).initiate({
        orderRef: row.publicId,
        amount: total,
        method,
      });
      const reference = initiated.kind === "manual_instructions" ? initiated.reference : row.publicId;
      const [pay] = await tx
        .insert(payments)
        .values({
          bookingId: row.id,
          userId: user.id,
          status: "awaiting_payment",
          method: method.id,
          amount: total.toFixed(2),
          currency,
          reference,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ publicId: payments.publicId });
      if (!pay) throw new ValidationError("Could not start payment.");
      return { booking: row, paymentPublicId: pay.publicId };
    });

    await recordAudit({
      entity: "bookings",
      entityPublicId: booking.publicId,
      operation: "create",
      changes: { occurrencePublicId, seats, status: booking.status, paymentPublicId },
      createdBy: actorId,
    });
    return { ...booking, paymentPublicId };
  }

  async listForUser(
    userPublicId: string,
  ): Promise<Array<BookingRow & { sessionTitle: string; startsAt: Date; paymentPublicId: string | null }>> {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId)).limit(1);
    if (!user) return [];
    const { timezone } = await getAppClock();
    const rows = await db
      .select({
        booking: bookings,
        sessionTitle: studioSessions.title,
        sessionStartsAt: studioSessions.startsAt,
        occursOn: studioSessionOccurrences.occursOn,
        paymentPublicId: payments.publicId,
      })
      .from(bookings)
      .innerJoin(studioSessions, eq(studioSessions.id, bookings.sessionId))
      .innerJoin(studioSessionOccurrences, eq(studioSessionOccurrences.id, bookings.occurrenceId))
      .leftJoin(payments, eq(payments.bookingId, bookings.id))
      .where(eq(bookings.userId, user.id))
      .orderBy(desc(studioSessionOccurrences.occursOn));
    return rows.map(({ booking, sessionTitle, sessionStartsAt, occursOn, paymentPublicId }) => ({
      ...booking,
      sessionTitle,
      startsAt: occurrenceStartsAt(occursOn, sessionStartsAt, timezone),
      paymentPublicId,
    }));
  }

  async listConfirmedOccurrencePublicIds(userPublicId: string): Promise<string[]> {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId)).limit(1);
    if (!user) return [];
    const rows = await db
      .select({ publicId: studioSessionOccurrences.publicId })
      .from(bookings)
      .innerJoin(studioSessionOccurrences, eq(studioSessionOccurrences.id, bookings.occurrenceId))
      .where(
        and(eq(bookings.userId, user.id), inArray(bookings.status, [...RESERVED_BOOKING_STATUSES])),
      );
    return rows.map((row) => row.publicId);
  }
}

export const bookingsService = new BookingsService(bookingsRepository);
