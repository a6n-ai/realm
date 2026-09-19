import { ValidationError } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import {
  canClaim,
  canVerify,
  computeTax,
  enabledMethods,
  findMethod,
  providerFor,
  type PaymentMethodConfig,
} from "@foundry/payments";
import { PAYMENTS_PLUGIN_ID } from "@foundry/payments/plugin";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bookings, payments, studioSessionOccurrences, users } from "@/db/schema";
import { getAppClock, getIntegrationsConfig, getPaymentConfig } from "./app-settings.service";
import { ledgerService } from "./ledger.service";
import { SessionUpdatableService } from "./session-service";

export type PaymentRow = typeof payments.$inferSelect;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function major(n: number): string {
  return round2(n).toFixed(2);
}

export function quoteBooking(
  priceAmount: string | number,
  seats: number,
  method: PaymentMethodConfig,
): { subtotal: number; taxTotal: number; total: number } {
  const unit = typeof priceAmount === "string" ? Number(priceAmount) : priceAmount;
  if (!Number.isFinite(unit) || unit < 0) throw new ValidationError("Class price is invalid.");
  const subtotal = round2(unit * seats);
  const { taxTotal } = computeTax(subtotal, method.taxes);
  return { subtotal, taxTotal, total: round2(subtotal + taxTotal) };
}

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
    return enabledMethods(await getPaymentConfig());
  }

  async createForBooking(input: {
    booking: { id: bigint; publicId: string; userId: bigint; seats: number };
    priceAmount: string;
    methodId: string;
  }): Promise<PaymentRow> {
    const cfg = await getPaymentConfig();
    const method = findMethod(cfg, input.methodId);
    if (!method?.enabled) throw new ValidationError("That payment method is not available.");
    const { currency } = await getAppClock();
    const { total } = quoteBooking(input.priceAmount, input.booking.seats, method);
    const initiated = providerFor(method).initiate({
      orderRef: input.booking.publicId,
      amount: total,
      method,
    });
    const reference = initiated.kind === "manual_instructions" ? initiated.reference : input.booking.publicId;
    return this.create({
      bookingId: input.booking.id,
      userId: input.booking.userId,
      status: "awaiting_payment",
      method: method.id,
      amount: major(total),
      currency,
      reference,
    });
  }

  async readForFamily(
    publicId: string,
    userPublicId: string,
  ): Promise<PaymentRow & { methodConfig: PaymentMethodConfig; bookingPublicId: string }> {
    const row = await this.read(publicId);
    const [owner] = await db.select({ publicId: users.publicId }).from(users).where(eq(users.id, row.userId)).limit(1);
    if (!owner || owner.publicId !== userPublicId) throw new ValidationError("Payment not found.");
    const cfg = await getPaymentConfig();
    const methodConfig = findMethod(cfg, row.method);
    if (!methodConfig) throw new ValidationError("Payment method is no longer configured.");
    const [booking] = await db
      .select({ publicId: bookings.publicId })
      .from(bookings)
      .where(eq(bookings.id, row.bookingId))
      .limit(1);
    if (!booking) throw new ValidationError("Booking not found.");
    return { ...row, methodConfig, bookingPublicId: booking.publicId };
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

    await db.transaction(async (tx) => {
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

    return this.read(publicId);
  }

  async reject(publicId: string, note?: string): Promise<PaymentRow> {
    const row = await this.read(publicId);
    if (!canVerify(row.status)) throw new ValidationError("This payment is not waiting on verification.");
    return this.update(publicId, { status: "rejected", note: note?.trim() || null });
  }

  async listForOccurrence(occurrencePublicId: string): Promise<Array<PaymentRow & { bookingPublicId: string; seats: number }>> {
    const rows = await db
      .select({
        payment: payments,
        bookingPublicId: bookings.publicId,
        seats: bookings.seats,
      })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .innerJoin(studioSessionOccurrences, eq(studioSessionOccurrences.id, bookings.occurrenceId))
      .where(eq(studioSessionOccurrences.publicId, occurrencePublicId));
    return rows.map((r) => ({ ...r.payment, bookingPublicId: r.bookingPublicId, seats: r.seats }));
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
