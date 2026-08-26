import { updatableColumns } from "@realm/database";
import { makeWalletTables } from "@realm/wallet/schema";
import { bigint, integer, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { ledgerDirection } from "./coupons";
import { durationPackages, mealSizes } from "./catalog";
import { orders } from "./orders";
import { users } from "./auth";
import { organization } from "./organizations";

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
  "inquiry_created", "inquiry_follow_up", "inquiry_converted",
  "ticket_created", "ticket_reply", "ticket_resolved",
  "signup", "manual_adjustment",
]);

export const { walletLedger, eventPayout, coinRate } = makeWalletTables({
  users,
  orders,
  appEvent,
  ledgerDirection,
});

// Coin payout rules keyed by (meal size, duration package). NULL on both is
// the default/catch-all rule (exactly one, seeded, never deletable) — every
// other row is a specific override with both dimensions set. Resolution
// (lib/services/wallet.service.ts) is: exact override match, else catch-all.
export const mealPayout = pgTable("meal_payout", {
  ...updatableColumns("mlp"),
  mealSizeId: bigint("meal_size_id", { mode: "bigint" }).references(() => mealSizes.id, { onDelete: "cascade" }),
  durationPackageId: bigint("duration_package_id", { mode: "bigint" }).references(() => durationPackages.id, { onDelete: "cascade" }),
  coins: integer("coins").notNull().default(0),
  // Client-scoping — null = shared across the whole app, set = one org's own
  // payout rule. See orders.organizationId for the pattern.
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  uniqueIndex("meal_payout_combo_unique").on(t.mealSizeId, t.durationPackageId),
]);
