import { ValidationError } from "@foundry/commons";
import { findMethod, providerFor } from "@foundry/payments";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { bookings, couponRedemptions, coupons, payments, studioSessionOccurrences, studioSessions, users } from "@/db/schema";
import { priceBooking, toPricing, type CodeError } from "@/lib/discounts/quote";
import { occurrenceStartsAt } from "@/lib/sessions/schedule";
import { getAppClock, getDiscountSettings, getPaymentConfig } from "./app-settings.service";
import { assertCanBook, remainingSeats, RESERVED_BOOKING_STATUSES } from "./booking-policy";
import { discountsService } from "./discounts.service";
import { ledgerService } from "./ledger.service";
import { lockedBalance, spendBookingCoins, takeBackBookingCoins, walletService } from "./wallet.service";
import { paymentsService } from "./payments.service";
import { currentUserId, recordAudit, SessionUpdatableService } from "./session-service";
import { bookingsRepository, type BookingRow } from "./bookings.repository";

export type CreateBookingResult = BookingRow & { paymentPublicId: string | null; codeError: CodeError | null };

class BookingsService extends SessionUpdatableService<typeof bookings> {
  async createForUser(
    userPublicId: string,
    occurrencePublicId: string,
    seats: number,
    opts: { methodId?: string; code?: string | null; useCoins?: boolean } = {},
  ): Promise<CreateBookingResult> {
    const actorId = await currentUserId();
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId)).limit(1);
    if (!user) throw new ValidationError("Sign in to book.");

    const rails = await paymentsService.enabledRails();
    const { timezone, currency } = await getAppClock();
    const cfg = await getPaymentConfig();
    const { maxDiscountPct } = await getDiscountSettings();
    const code = opts.code?.trim() ? opts.code : null;

    const { booking, paymentPublicId, codeError } = await db.transaction(async (tx) => {
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
      const pricedClass = rails.length > 0 && Number.isFinite(unit) && unit > 0;
      const method = pricedClass
        ? findMethod(cfg, opts.methodId ?? rails[0]!.id) ?? rails.find((r) => r.enabled) ?? rails[0]
        : undefined;
      if (pricedClass && !method?.enabled) throw new ValidationError("No payment method is enabled.");

      // The coupon row is locked here, so a racing booking for the same code waits
      // and then sees the incremented redemption count.
      const rules = pricedClass
        ? await discountsService.loadPricing(tx, { code, userId: user.id, lock: true })
        : { discounts: [], coupon: null };
      // Coins: only with a coin rate set; the balance is read under the family's lock.
      const rate = opts.useCoins && pricedClass ? await walletService.walletRate() : null;
      const balance = rate ? await lockedBalance(tx, user.id) : 0;
      const coins = rate && balance > 0 ? { balance, rate } : null;

      const quote = pricedClass
        ? priceBooking({
            unitPrice: session.priceAmount,
            seats,
            session: { id: session.id, category: session.category },
            method: method ?? null,
            discounts: rules.discounts,
            coupon: rules.coupon,
            codeTyped: Boolean(code),
            maxDiscountPct,
            now: now.getTime(),
            coins,
          })
        : null;
      const needsPay = quote != null && quote.total > 0;

      const [row] = await tx
        .insert(bookings)
        .values({
          sessionId: session.id,
          occurrenceId: occurrence.id,
          userId: user.id,
          seats,
          status: needsPay ? "pending" : "confirmed",
          pricing: quote ? toPricing(quote) : null,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning();
      if (!row) throw new ValidationError("Could not save the booking.");

      const applied = quote?.adjustments.find((a) => a.kind === "coupon");
      if (applied) {
        const [c] = await tx
          .update(coupons)
          .set({ redemptionCount: sql`${coupons.redemptionCount} + 1`, updatedBy: actorId })
          .where(eq(coupons.publicId, applied.publicId))
          .returning({ id: coupons.id });
        if (!c) throw new ValidationError("Could not apply the code.");
        await tx.insert(couponRedemptions).values({
          couponId: c.id,
          bookingId: row.id,
          userId: user.id,
          amountApplied: applied.amount.toFixed(2),
          createdBy: actorId,
          updatedBy: actorId,
        });
      }
      // Coins write their own discount ledger row through the wallet package.
      const wallet = quote?.adjustments.find((a) => a.kind === "wallet");
      if (wallet?.coins) {
        await spendBookingCoins(tx, { userId: user.id, bookingId: row.id, coins: wallet.coins, amount: wallet.amount, hold: needsPay });
      }
      const priceCuts = quote?.adjustments.filter((a) => a.kind !== "wallet") ?? [];
      const cutTotal = priceCuts.reduce((sum, a) => sum + a.amount, 0);
      if (cutTotal > 0) {
        await ledgerService.record(tx, {
          userId: user.id,
          bookingId: row.id,
          direction: "credit",
          type: "discount",
          amount: cutTotal.toFixed(2),
          currency,
          memo: priceCuts.map((a) => a.name).join(", "),
        });
      }

      const codeError = quote?.codeError ?? null;
      if (!needsPay || !method) return { booking: row, paymentPublicId: null as string | null, codeError };

      const initiated = providerFor(method).initiate({ orderRef: row.publicId, amount: quote.total, method });
      const reference = initiated.kind === "manual_instructions" ? initiated.reference : row.publicId;
      const [pay] = await tx
        .insert(payments)
        .values({
          bookingId: row.id,
          userId: user.id,
          status: "awaiting_payment",
          method: method.id,
          amount: quote.total.toFixed(2),
          currency,
          reference,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ publicId: payments.publicId });
      if (!pay) throw new ValidationError("Could not start payment.");
      return { booking: row, paymentPublicId: pay.publicId, codeError };
    });

    await recordAudit({
      entity: "bookings",
      entityPublicId: booking.publicId,
      operation: "create",
      changes: {
        occurrencePublicId,
        seats,
        status: booking.status,
        paymentPublicId,
        adjustments: booking.pricing?.adjustments ?? [],
      },
      createdBy: actorId,
    });
    return { ...booking, paymentPublicId, codeError };
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
      family: r.name ?? r.email ?? "Family",
      paymentStatus: r.paymentStatus,
    }));
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
