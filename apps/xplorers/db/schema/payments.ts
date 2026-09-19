import { updatableColumns } from "@foundry/database";
import type { PaymentLifecycle } from "@foundry/payments";
import { bigint, index, numeric, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { bookings } from "./studio";

export const PAYMENT_STATUSES = [
  "awaiting_payment",
  "pending_verification",
  "paid",
  "rejected",
  "refunded",
] as const satisfies readonly PaymentLifecycle[];

export const LEDGER_DIRECTIONS = ["debit", "credit"] as const;
export const LEDGER_ENTRY_TYPES = ["payment", "refund", "discount", "adjustment"] as const;

export const paymentStatus = pgEnum("payment_status", [...PAYMENT_STATUSES]);
export const ledgerDirection = pgEnum("ledger_direction", [...LEDGER_DIRECTIONS]);
export const ledgerEntryType = pgEnum("ledger_entry_type", [...LEDGER_ENTRY_TYPES]);

/**
 * One payment for a booking (the payable). `method` is the Foundry provider id
 * (etransfer / cash / manual today; Stripe later without an enum rewrite).
 */
export const payments = pgTable(
  "payments",
  {
    ...updatableColumns("pay"),
    bookingId: bigint("booking_id", { mode: "bigint" })
      .notNull()
      .references(() => bookings.id),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id),
    status: paymentStatus("status").notNull().default("awaiting_payment"),
    method: text("method").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    reference: text("reference"),
    providerEventId: text("provider_event_id"),
    claimedAt: bigint("claimed_at", { mode: "number" }),
    capturedAt: bigint("captured_at", { mode: "number" }),
    note: text("note"),
  },
  (t) => [
    index("payments_booking_idx").on(t.bookingId),
    index("payments_user_idx").on(t.userId),
    uniqueIndex("payments_provider_event_idx").on(t.providerEventId),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    ...updatableColumns("led"),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id),
    bookingId: bigint("booking_id", { mode: "bigint" }).references(() => bookings.id),
    paymentId: bigint("payment_id", { mode: "bigint" }).references(() => payments.id),
    direction: ledgerDirection("direction").notNull(),
    type: ledgerEntryType("type").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    memo: text("memo"),
    providerEventId: text("provider_event_id"),
  },
  (t) => [
    index("ledger_user_created_idx").on(t.userId, t.createdAt),
    index("ledger_booking_idx").on(t.bookingId),
    uniqueIndex("ledger_provider_event_idx").on(t.providerEventId),
  ],
);
