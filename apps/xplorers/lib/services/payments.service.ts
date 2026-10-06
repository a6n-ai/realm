import { ValidationError } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { UpdatableRepository } from "@foundry/database";
import {
  canClaim,
  canVerify,
  enabledMethods,
  findMethod,
  type PaymentMethodConfig,
} from "@foundry/payments";
import { PAYMENTS_PLUGIN_ID } from "@foundry/payments/plugin";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bookings, payments, studioSessionOccurrences, users, type BookingPricing } from "@/db/schema";
import { getIntegrationsConfig, getPaymentConfig } from "./app-settings.service";
import { ledgerService } from "./ledger.service";
import { recollectLapsedCoins, settleBookingCoins, walletService } from "./wallet.service";
import { currentUserId, recordAudit, SessionUpdatableService } from "./session-service";

const log = createLogger("payments");

export type PaymentRow = typeof payments.$inferSelect;

export type PaymentListRow = {
  publicId: string;
  createdAt: number;
  status: PaymentRow["status"];
  method: string;
  amount: string;
  currency: string;
  reference: string | null;
  customerName: string | null;
  customerEmail: string | null;
  bookingPublicId: string;
};

class PaymentsService extends SessionUpdatableService<typeof payments> {
  protected sensitive = true;

  async paymentsInstalled(): Promise<boolean> {
    const cfg = await getIntegrationsConfig();
    const flag = cfg[PAYMENTS_PLUGIN_ID] as { installed?: boolean } | undefined;
    return Boolean(flag?.installed);
  }

  async enabledRails(): Promise<PaymentMethodConfig[]> {
    if (!(await this.paymentsInstalled())) return [];
    // Catalog is cash + e-Transfer only; ignore any leftover manual/card row.
    return enabledMethods(await getPaymentConfig()).filter(
      (m) => m.id === "cash" || m.id === "etransfer",
    );
  }

  async readForFamily(
    publicId: string,
    userPublicId: string,
  ): Promise<PaymentRow & { methodConfig: PaymentMethodConfig; bookingPublicId: string; pricing: BookingPricing | null }> {
    const row = await this.read(publicId);
    const [owner] = await db.select({ publicId: users.publicId }).from(users).where(eq(users.id, row.userId)).limit(1);
    if (!owner || owner.publicId !== userPublicId) throw new ValidationError("Payment not found.");
    const cfg = await getPaymentConfig();
    const methodConfig = findMethod(cfg, row.method);
    if (!methodConfig) throw new ValidationError("Payment method is no longer configured.");
    const [booking] = await db
      .select({ publicId: bookings.publicId, pricing: bookings.pricing })
      .from(bookings)
      .where(eq(bookings.id, row.bookingId))
      .limit(1);
    if (!booking) throw new ValidationError("Booking not found.");
    return { ...row, methodConfig, bookingPublicId: booking.publicId, pricing: booking.pricing };
  }

  async claim(publicId: string, userPublicId: string, reference: string): Promise<PaymentRow> {
    const row = await this.readForFamily(publicId, userPublicId);
    if (!canClaim(row.status)) throw new ValidationError("This payment cannot be claimed.");
    const trimmed = reference.trim();
    if (!trimmed) throw new ValidationError("Add the transfer reference.");
    return this.update(publicId, {
      status: "pending_verification",
      reference: trimmed,
      claimedAt: Date.now(),
    });
  }

  async verify(publicId: string): Promise<PaymentRow> {
    const row = await this.read(publicId);
    if (!canVerify(row.status)) throw new ValidationError("This payment is not waiting on verification.");
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, row.bookingId)).limit(1);
    if (!booking) throw new ValidationError("Booking not found.");

    type Lapsed = { coins: number; collected: number; notCollected: number };
    let lapsed: Lapsed | null = null;
    await db.transaction(async (tx) => {
      // Coins held at booking become spent. If the hold lapsed first, take the
      // coins again so they can't fund a second booking; never block the payment.
      const settled = await settleBookingCoins(tx, { userId: row.userId, bookingId: booking.id });
      if (settled.status === "expired") {
        const r = await recollectLapsedCoins(tx, {
          userId: row.userId,
          bookingId: booking.id,
          bookingPublicId: booking.publicId,
          coins: settled.coins,
        });
        lapsed = { coins: settled.coins, ...r };
      }
      await tx
        .update(payments)
        .set({ status: "paid", capturedAt: Date.now() })
        .where(and(eq(payments.id, row.id), eq(payments.status, "pending_verification")));
      await tx.update(bookings).set({ status: "confirmed" }).where(eq(bookings.id, booking.id));
      await ledgerService.record(tx, {
        userId: row.userId,
        bookingId: booking.id,
        paymentId: row.id,
        direction: "credit",
        type: "payment",
        amount: row.amount,
        currency: row.currency,
        memo: `booking ${booking.publicId}`,
        providerEventId: row.providerEventId,
      });
    });

    // Assigned inside the transaction callback, which TS cannot see.
    const lapsedCoins = lapsed as Lapsed | null;
    if (lapsedCoins) {
      log.warn({ bookingPublicId: booking.publicId, ...lapsedCoins }, "coin hold expired before payment verification");
      await recordAudit({
        entity: "bookings",
        entityPublicId: booking.publicId,
        operation: "update",
        changes: { coinHoldExpired: lapsedCoins },
        createdBy: await currentUserId(),
      });
    }
    await walletService.awardBookingEvents(booking.id);
    return this.read(publicId);
  }

  async reject(publicId: string, note?: string): Promise<PaymentRow> {
    const row = await this.read(publicId);
    if (!canVerify(row.status)) throw new ValidationError("This payment is not waiting on verification.");
    return this.update(publicId, { status: "rejected", note: note?.trim() || null });
  }

  async listForOccurrence(
    occurrencePublicId: string,
  ): Promise<Array<PaymentRow & { bookingPublicId: string; seats: number; pricing: BookingPricing | null }>> {
    const rows = await db
      .select({
        payment: payments,
        bookingPublicId: bookings.publicId,
        seats: bookings.seats,
        pricing: bookings.pricing,
      })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .innerJoin(studioSessionOccurrences, eq(studioSessionOccurrences.id, bookings.occurrenceId))
      .where(eq(studioSessionOccurrences.publicId, occurrencePublicId));
    return rows.map((r) => ({ ...r.payment, bookingPublicId: r.bookingPublicId, seats: r.seats, pricing: r.pricing }));
  }

  async listRecent(limit = 50): Promise<PaymentListRow[]> {
    return db
      .select({
        publicId: payments.publicId,
        createdAt: payments.createdAt,
        status: payments.status,
        method: payments.method,
        amount: payments.amount,
        currency: payments.currency,
        reference: payments.reference,
        customerName: users.name,
        customerEmail: users.email,
        bookingPublicId: bookings.publicId,
      })
      .from(payments)
      .innerJoin(users, eq(users.id, payments.userId))
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .orderBy(desc(payments.createdAt))
      .limit(limit);
  }
}

export const paymentsRepository = new UpdatableRepository(db, payments, payments.publicId, payments.id);
export const paymentsService = new PaymentsService(paymentsRepository);
