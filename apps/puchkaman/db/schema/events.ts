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
  // A Clover Customer Directory row with no matching `users` account —
  // admin-triggered from the Clover Customers page, not a lifecycle event.
  "clover_customer_invite",
  // Auth/security transactional email — migrated off @foundry/auth's direct-send
  // path (2026-09) onto the notification pipeline so every email lands in one
  // place (Logs) instead of splitting between email_log and notification_outbox.
  "email_verification_link", "email_otp_password_reset", "email_otp_verification",
  "account_deletion_confirm", "password_changed", "new_login_alert",
]);
