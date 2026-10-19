import { ValidationError } from "@foundry/commons";
import { findMethod, providerFor } from "@foundry/payments";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  bookingChildren,
  bookings,
  children,
  couponRedemptions,
  coupons,
  payments,
  studioSessionOccurrences,
  studioSessions,
  users,
} from "@/db/schema";
import { priceBooking, toPricing, type BookingQuote, type CodeError } from "@/lib/discounts/quote";
import { ageOn, checkAge } from "@/lib/children/age";
import { quoteBooking } from "@/lib/pricing/quote";
import type { BookingChoice, Quote } from "@/lib/pricing/types";
import { getAppClock, getDefaultPrices, getDiscountSettings, getPaymentConfig } from "./app-settings.service";
import { assertCanBook, remainingSeats, RESERVED_BOOKING_STATUSES } from "./booking-policy";
import { discountsService, type Tx } from "./discounts.service";
import { ledgerService } from "./ledger.service";
import { lockedBalance, spendBookingCoins, takeBackBookingCoins, walletService } from "./wallet.service";
import { paymentsService } from "./payments.service";
import { currentUserId, recordAudit, SessionUpdatableService } from "./session-service";
import { bookingsRepository, type BookingRow } from "./bookings.repository";

export type CreateBookingResult = BookingRow & { paymentPublicId: string | null; codeError: CodeError | null };

export type BookingRequest = {
  occurrencePublicId: string;
  startsAt: string;
  choice: BookingChoice;
  extensionSteps: number;
  childPublicIds: string[];
  adults: number;
  code?: string | null;
  useCoins?: boolean;
  methodId?: string;
};

function validateRequest(input: BookingRequest): Date {
  if (!Number.isInteger(input.adults) || input.adults < 0) throw new ValidationError("Adults is invalid.");
  if (!Number.isInteger(input.extensionSteps) || input.extensionSteps < 0) throw new ValidationError("Extension is invalid.");
  const ids = input.childPublicIds;
  if (!Array.isArray(ids) || ids.length === 0) throw new ValidationError("Pick at least one child.");
  if (new Set(ids).size !== ids.length) throw new ValidationError("A child can only be picked once.");
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw new ValidationError("Start time is invalid.");
  return startsAt;
}

class BookingsService extends SessionUpdatableService<typeof bookings> {
  /**
   * Everything a booking charges, from one code path. With `lock` it runs inside the
   * booking transaction and takes the row locks; without, it only reads (preview).
   */
  private async compute(tx: Tx, userPublicId: string, input: BookingRequest, lock: boolean) {
    const startsAt = validateRequest(input);
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId)).limit(1);
    if (!user) throw new ValidationError("Sign in to book.");

    const rails = await paymentsService.enabledRails();
    const { currency } = await getAppClock();
    const cfg = await getPaymentConfig();
    const { maxDiscountPct } = await getDiscountSettings();
    const globalTable = await getDefaultPrices();
    const code = input.code?.trim() ? input.code : null;

    const occQ = tx
      .select()
      .from(studioSessionOccurrences)
      .where(eq(studioSessionOccurrences.publicId, input.occurrencePublicId))
      .limit(1);
    const [occurrence] = lock ? await occQ.for("update") : await occQ;
    if (!occurrence) throw new ValidationError("Session not found.");
    if (occurrence.status === "cancelled") throw new ValidationError("This session was cancelled.");

    const sessQ = tx.select().from(studioSessions).where(eq(studioSessions.id, occurrence.sessionId)).limit(1);
    const [session] = lock ? await sessQ.for("update") : await sessQ;
    if (!session) throw new ValidationError("Session not found.");
    if (session.bookingType === "enquire_only") throw new ValidationError("This class is by enquiry only.");

    const kids = await tx
      .select()
      .from(children)
      .where(and(eq(children.userId, user.id), inArray(children.publicId, input.childPublicIds)));
    if (kids.length !== input.childPublicIds.length) throw new ValidationError("Pick your own children.");
    const waivers = new Map<bigint, boolean>();
    for (const kid of kids) {
      const verdict = checkAge(session, ageOn(kid.dateOfBirth, occurrence.occursOn));
      if (verdict === "blocked") throw new ValidationError(`${kid.name} is outside the age range for this class.`);
      waivers.set(kid.id, verdict === "waiver");
    }

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

    const now = new Date();
    assertCanBook({
      published: session.published,
      archived: session.archived,
      startsAt: occurrence.startsAt,
      now,
      remaining: remainingSeats(occurrence.capacity, Number(sum?.seats ?? 0)),
      seats: kids.length,
    });

    const price: Quote = quoteBooking({
      pricing: session.pricing,
      layers: [occurrence.prices, session.prices, globalTable],
      globalTable,
      occursOn: occurrence.occursOn,
      windowStart: occurrence.startsAt,
      windowEnd: occurrence.endsAt,
      startsAt,
      choice: input.choice,
      extensionSteps: input.extensionSteps,
      children: kids.length,
      adults: input.adults,
    });

    const pricedClass = rails.length > 0 && price.subtotal > 0;
    const method = pricedClass
      ? findMethod(cfg, input.methodId ?? rails[0]!.id) ?? rails.find((r) => r.enabled) ?? rails[0]
      : undefined;
    if (pricedClass && !method?.enabled) throw new ValidationError("No payment method is enabled.");

    // The coupon row is locked when booking, so a racing booking for the same code
    // waits and then sees the incremented redemption count.
    const rules = pricedClass
      ? await discountsService.loadPricing(tx, { code, userId: user.id, lock })
      : { discounts: [], coupon: null };
    // Coins: only with a coin rate set; the balance is read under the family's lock when booking.
    const rate = input.useCoins && pricedClass ? await walletService.walletRate() : null;
    const balance = rate ? (lock ? await lockedBalance(tx, user.id) : await walletService.balance(user.id)) : 0;
    const coins = rate && balance > 0 ? { balance, rate } : null;

    // ponytail: discounts see the whole booking as one line; split per child when per-child discounts exist.
    const lines: BookingQuote | null = pricedClass
      ? priceBooking({
          unitPrice: price.subtotal,
          seats: 1,
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
    return { user, occurrence, session, kids, waivers, startsAt, price, lines, method, currency };
  }

  async quote(input: BookingRequest, userPublicId: string): Promise<Quote & { total: number; lines: BookingQuote; currency: string }> {
    const c = await db.transaction((tx) => this.compute(tx, userPublicId, input, false));
    const lines: BookingQuote = c.lines ?? { subtotal: c.price.subtotal, adjustments: [], discountTotal: 0, taxTotal: 0, total: 0, codeError: null };
    return { ...c.price, total: lines.total, lines, currency: c.currency };
  }

  async createForUser(userPublicId: string, input: BookingRequest): Promise<CreateBookingResult> {
    const actorId = await currentUserId();
    const { currency } = await getAppClock();

    const { booking, paymentPublicId, codeError } = await db.transaction(async (tx) => {
      const { user, occurrence, session, kids, waivers, startsAt, price, lines: quote, method } = await this.compute(
        tx,
        userPublicId,
        input,
        true,
      );
      const needsPay = quote != null && quote.total > 0;

      const [row] = await tx
        .insert(bookings)
        .values({
          sessionId: session.id,
          occurrenceId: occurrence.id,
          userId: user.id,
          seats: kids.length,
          startsAt,
          endsAt: price.endsAt,
          optionKey: input.choice.kind === "option" ? input.choice.key : null,
          lengthMinutes: Math.round((price.endsAt.getTime() - startsAt.getTime()) / 60_000),
          extensionSteps: input.extensionSteps,
          adults: input.adults,
          status: needsPay ? "pending" : "confirmed",
          pricing: quote ? toPricing(quote) : null,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning();
      if (!row) throw new ValidationError("Could not save the booking.");

      await tx.insert(bookingChildren).values(
        kids.map((kid) => ({
          bookingId: row.id,
          childId: kid.id,
          waiverUsed: waivers.get(kid.id) ?? false,
          createdBy: actorId,
          updatedBy: actorId,
        })),
      );

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
        occurrencePublicId: input.occurrencePublicId,
        seats: booking.seats,
        adults: input.adults,
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
