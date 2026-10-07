import { desc, eq, sql } from "drizzle-orm";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { db } from "@/db/client";
import { bookings, ledgerEntries, payments, studioSessions } from "@/db/schema";

export type CustomerPaymentRow = {
  publicId: string;
  status: (typeof payments.status.enumValues)[number];
  method: string;
  amount: string;
  currency: string;
  reference: string | null;
  createdAt: number;
  bookingPublicId: string;
  sessionTitle: string;
};

export type MoneyLedgerTx = {
  publicId: string;
  type: (typeof ledgerEntries.type.enumValues)[number];
  direction: (typeof ledgerEntries.direction.enumValues)[number];
  amount: string;
  currency: string;
  memo: string | null;
  createdAt: number;
  bookingPublicId: string | null;
};

/** Paginated payments for the signed-in customer (IDOR-gated by userId). */
export async function myPaymentsPage(userId: bigint, page: PageRequest): Promise<Page<CustomerPaymentRow>> {
  const where = eq(payments.userId, userId);
  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        publicId: payments.publicId,
        status: payments.status,
        method: payments.method,
        amount: payments.amount,
        currency: payments.currency,
        reference: payments.reference,
        createdAt: payments.createdAt,
        bookingPublicId: bookings.publicId,
        sessionTitle: studioSessions.title,
      })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .innerJoin(studioSessions, eq(studioSessions.id, bookings.sessionId))
      .where(where)
      .orderBy(desc(payments.createdAt), desc(payments.id))
      .limit(page.size)
      .offset(page.page * page.size),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(payments).where(where),
  ]);

  return { items: rows, page: page.page, size: page.size, total: count };
}

/** Paginated money ledger for the signed-in customer (IDOR-gated by userId). */
export async function myMoneyLedgerPage(userId: bigint, page: PageRequest): Promise<Page<MoneyLedgerTx>> {
  const where = eq(ledgerEntries.userId, userId);
  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        publicId: ledgerEntries.publicId,
        type: ledgerEntries.type,
        direction: ledgerEntries.direction,
        amount: ledgerEntries.amount,
        currency: ledgerEntries.currency,
        memo: ledgerEntries.memo,
        createdAt: ledgerEntries.createdAt,
        bookingPublicId: bookings.publicId,
      })
      .from(ledgerEntries)
      .leftJoin(bookings, eq(ledgerEntries.bookingId, bookings.id))
      .where(where)
      .orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id))
      .limit(page.size)
      .offset(page.page * page.size),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(ledgerEntries).where(where),
  ]);

  return {
    items: rows.map((r) => ({ ...r, bookingPublicId: r.bookingPublicId ?? null })),
    page: page.page,
    size: page.size,
    total: count,
  };
}
