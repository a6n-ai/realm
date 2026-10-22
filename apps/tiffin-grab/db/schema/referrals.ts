import { updatableColumns } from "@foundry/database";
import { bigint, index, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { orders } from "./orders";

export const referralStatus = pgEnum("referral_status", ["joined", "ordered", "rewarded", "reversed"]);

// One row per referred friend. The wallet ledger is the money truth; this row is
// the referral's state and what each side got, for the Refer tab and admin list.
export const referrals = pgTable("referrals", {
  ...updatableColumns("ref"),
  referrerUserId: bigint("referrer_user_id", { mode: "bigint" }).notNull().references(() => users.id),
  // Unique: a customer is referred at most once.
  referredUserId: bigint("referred_user_id", { mode: "bigint" }).notNull().unique().references(() => users.id),
  status: referralStatus("status").notNull().default("joined"),
  // The friend's first paid order, set when it qualifies.
  qualifyingOrderId: bigint("qualifying_order_id", { mode: "bigint" }).references(() => orders.id),
  referrerCoins: integer("referrer_coins").notNull().default(0),
  friendCoins: integer("friend_coins").notNull().default(0),
  // Why a side earned nothing: off | cap | wallet_cap | no_rate | referrer_inactive.
  skipReason: text("skip_reason"),
}, (t) => [index("referrals_referrer_idx").on(t.referrerUserId)]);
