import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Business events that can produce a notification. Matched to the real
 * order_status and payment_status lifecycles, not tiffin-grab's subscription
 * ones — puchkaman sells single pickup/delivery orders.
 */
export const appEvent = pgEnum("app_event", [
  "order_placed",
  "order_paid",
  "order_fulfilled",
  "order_cancelled",
  "payment_failed",
  "refund_issued",
  "catering_inquiry",
  "contact_message",
  "signup",
  "cart_abandoned",
  "checkout_abandoned",
]);
