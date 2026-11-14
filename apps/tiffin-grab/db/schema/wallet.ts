import { makeWalletTables } from "@foundry/wallet/schema";
import { pgEnum } from "drizzle-orm/pg-core";
import { ledgerDirection } from "./coupons";
import { orders } from "./orders";
import { users } from "./auth";

// Unified app-wide event catalog. Wallet payouts (event_payout) AND notification
// templates key off this single enum. An event need not have a payout or a
// template — each subsystem uses the subset that applies. It stays app-local:
// puchkaman has its own value set under the same Postgres type name, which is
// why the wallet tables come from a factory rather than being shared directly.
export const appEvent = pgEnum("app_event", [
  "order_created", "order_activated", "order_completed", "order_cancelled", "order_paused",
  "payment_received", "refund_issued",
  "menu_released",
  "wallet_credited", "wallet_redeemed",
  "inquiry_created", "inquiry_follow_up", "inquiry_converted", "inquiry_reinquiry",
  "ticket_created", "ticket_reply", "ticket_resolved",
  "signup", "manual_adjustment",
  // Auth/security transactional email — migrated off @foundry/auth's direct-send
  // path (2026-09) onto the notification pipeline so every email lands in one
  // place (Logs) instead of splitting between email_log and notification_outbox.
  "email_verification_link", "email_otp_password_reset", "email_otp_verification",
  "account_deletion_confirm", "password_changed", "new_login_alert",
  // Google review request — migrated off direct SES send (2026-09) so it lands
  // in the outbox/Logs like everything else instead of only email_log.
  "review_nudge",
  // Staff invitation email (organization plugin) — migrated onto the
  // notification pipeline (2026-09) same as the other auth/security events.
  "staff_invitation",
  // Admin-sent customer invite: a welcome email carrying a magic sign-in link.
  "customer_invitation",
  // Staff-sent nudge for an unpaid manual payment: a magic sign-in link that
  // lands on Finances → Bills so the customer can upload their screenshot.
  "payment_reminder",
  // Staff verified a manual payment (payment_received is the customer's claim).
  "payment_approved",
  // Staff gave a free tiffin on the customer's plan.
  "order_complimentary",
  // A holiday closed one of the customer's delivery days / a declared holiday was removed.
  "holiday_declared",
  "holiday_removed",
  // Referral rewards: the friend and the referrer, both on the friend's first paid order.
  "referral_referrer",
  "referral_friend",
  // Daily job: the plan's last tiffin is 5 days or 1 day away.
  "order_renewal_reminder",
  // Customer pressed "Email receipt" on a bill: the order's receipt PDF, attached.
  "order_receipt",
]);

export const { walletLedger, eventPayout, coinRate } = makeWalletTables({
  users,
  orders,
  appEvent,
  ledgerDirection,
});
