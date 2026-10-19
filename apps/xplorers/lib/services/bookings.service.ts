import { ValidationError } from "@foundry/commons";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { bookings, payments, studioSessionOccurrences, studioSessions, users } from "@/db/schema";
import type { CodeError } from "@/lib/discounts/quote";
import { RESERVED_BOOKING_STATUSES } from "./booking-policy";
import { takeBackBookingCoins } from "./wallet.service";
import { currentUserId, recordAudit, SessionUpdatableService } from "./session-service";
import { bookingsRepository, type BookingRow } from "./bookings.repository";

export type CreateBookingResult = BookingRow & { paymentPublicId: string | null; codeError: CodeError | null };

class BookingsService extends SessionUpdatableService<typeof bookings> {
  // Task 9 rebuilds booking around layered pricing and children.
  async createForUser(
    _userPublicId: string,
    _occurrencePublicId: string,
    _seats: number,
    _opts: { methodId?: string; code?: string | null; useCoins?: boolean } = {},
  ): Promise<CreateBookingResult> {
    throw new ValidationError("Booking is being rebuilt");
  }

  /**
   * Staff cancel: frees the seat and settles the family's coins (see
   * takeBackBookingCoins). An unpaid payment is rejected so it can't be claimed.
   * Locks payment → family → booking, the same order payment verify uses.
   */
  async cancel(bookingPublicId: string): Promise<void> {
    const actorId = await currentUserId();
    const booking = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: bookings.id, publicId: bookings.publicId, userId: bookings.userId, status: bookings.status, userPublicId: users.publicId })
        .from(bookings)
        .innerJoin(users, eq(users.id, bookings.userId))
        .where(eq(bookings.publicId, bookingPublicId))
        .limit(1);
      if (!row) throw new ValidationError("Booking not found.");
      const [pay] = await tx.select().from(payments).where(eq(payments.bookingId, row.id)).for("update").limit(1);
      const [locked] = await tx.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, row.id)).for("update").limit(1);
      if (locked?.status === "cancelled") throw new ValidationError("This booking is already cancelled.");

      const paid = pay?.status === "paid";
      await takeBackBookingCoins(tx, {
        userId: row.userId,
        userPublicId: row.userPublicId,
        bookingId: row.id,
        bookingPublicId: row.publicId,
        paid,
      });
      if (pay && !paid && pay.status !== "refunded") {
        await tx.update(payments).set({ status: "rejected", note: "Booking cancelled", updatedBy: actorId }).where(eq(payments.id, pay.id));
      }
      await tx.update(bookings).set({ status: "cancelled", updatedBy: actorId }).where(eq(bookings.id, row.id));
      return row;
    });
    await recordAudit({
      entity: "bookings",
      entityPublicId: booking.publicId,
      operation: "update",
      changes: { status: { from: booking.status, to: "cancelled" } },
      createdBy: actorId,
    });
  }

  async listForOccurrence(occurrencePublicId: string): Promise<
    { publicId: string; seats: number; status: BookingRow["status"]; family: string; paymentStatus: string | null }[]
  > {
    const rows = await db
      .select({
        publicId: bookings.publicId,
        seats: bookings.seats,
        status: bookings.status,
        name: users.name,
        email: users.email,
        paymentStatus: payments.status,
      })
      .from(bookings)
      .innerJoin(studioSessionOccurrences, eq(studioSessionOccurrences.id, bookings.occurrenceId))
      .innerJoin(users, eq(users.id, bookings.userId))
      .leftJoin(payments, eq(payments.bookingId, bookings.id))
      .where(eq(studioSessionOccurrences.publicId, occurrencePublicId))
      .orderBy(desc(bookings.createdAt));
    return rows.map((r) => ({
      publicId: r.publicId,
      seats: r.seats,
      status: r.status,
      family: r.name ?? r.email ?? "Customer",
      paymentStatus: r.paymentStatus,
    }));
  }

  async listForUser(
    userPublicId: string,
  ): Promise<Array<BookingRow & { sessionTitle: string; paymentPublicId: string | null }>> {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId)).limit(1);
    if (!user) return [];
    const rows = await db
      .select({
        booking: bookings,
        sessionTitle: studioSessions.title,
        occursOn: studioSessionOccurrences.occursOn,
        paymentPublicId: payments.publicId,
      })
      .from(bookings)
      .innerJoin(studioSessions, eq(studioSessions.id, bookings.sessionId))
      .innerJoin(studioSessionOccurrences, eq(studioSessionOccurrences.id, bookings.occurrenceId))
      .leftJoin(payments, eq(payments.bookingId, bookings.id))
      .where(eq(bookings.userId, user.id))
      .orderBy(desc(studioSessionOccurrences.occursOn));
    return rows.map(({ booking, sessionTitle, paymentPublicId }) => ({ ...booking, sessionTitle, paymentPublicId }));
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
