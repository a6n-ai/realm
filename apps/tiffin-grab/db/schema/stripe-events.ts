import { bigint, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { payments } from "./orders";

// Dedupe inbox + audit trail for Stripe webhooks; feeds Payments → Provider logs.
export const stripeEvents = pgTable("stripe_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  paymentId: bigint("payment_id", { mode: "bigint" }).references(() => payments.id),
  payload: jsonb("payload").notNull(),
  receivedAt: bigint("received_at", { mode: "number" }).notNull(),
  processedAt: bigint("processed_at", { mode: "number" }),
  error: text("error"),
}, (t) => [index("stripe_events_received_idx").on(t.receivedAt), index("stripe_events_payment_idx").on(t.paymentId)]);
