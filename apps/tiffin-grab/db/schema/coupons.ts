import { baseColumns, updatableColumns } from "@realm/database";
import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { orders, payments } from "./orders";

export const couponKind = pgEnum("coupon_kind", [
  "percentage",
  "fixed",
  "free_delivery",
  "first_order",
  "rep_daily",
]);

export type CouponKind = (typeof couponKind.enumValues)[number];

// The row is discriminated by `kind`; queryable constraints are first-class
// columns, kind-specific non-queryable bits live here.
export type CouponConfig =
  | { kind: "percentage" }
  | { kind: "fixed" }
  | { kind: "free_delivery" }
  | { kind: "first_order"; mode: "percentage" | "fixed" }
  | { kind: "rep_daily" };

// Admin discount governance blob on app_settings (mirrors leadAssignment).
export interface DiscountPolicy {
  enabledKinds: CouponKind[];
  repDaily: {
    enabled: boolean;
    defaultCapPct: number;
    defaultCapAmount: number;
    // How many times a rep may apply their daily coupon to grant a discount that
    // day (snapshotted onto the minted coupon's maxRedemptions). 1 = single-use,
    // preserving the legacy behavior until an admin raises it.
    defaultDailyUses: number;
    perRep: Record<string, { capPct?: number; capAmount?: number; dailyUses?: number; active: boolean }>;
  };
}

export const coupons = pgTable("coupons", {
  ...updatableColumns("cpn"),
  code: text("code").notNull().unique(),
  kind: couponKind("kind").notNull(),
  name: text("name").notNull(),
  description: text("description"),

  // value (kind-dependent; nullable)
  valuePct: numeric("value_pct", { precision: 5, scale: 2 }),
  valueAmount: numeric("value_amount", { precision: 10, scale: 2 }),

  // rep_daily ceilings (snapshotted at mint)
  capPct: numeric("cap_pct", { precision: 5, scale: 2 }),
  capAmount: numeric("cap_amount", { precision: 10, scale: 2 }),

  // orthogonal constraints
  minSubtotal: numeric("min_subtotal", { precision: 10, scale: 2 }),
  maxRedemptions: integer("max_redemptions"),
  maxPerUser: integer("max_per_user"),
  redemptionCount: integer("redemption_count").notNull().default(0),
  stackable: boolean("stackable").notNull().default(false),
  // Auto-applied at checkout when valid (no code needed). Festival/launch promos
  // are just autoApply coupons with a startsAt/expiresAt window — no special kind.
  autoApply: boolean("auto_apply").notNull().default(false),
  planTypes: text("plan_types").array().notNull().default([]),

  // validity window (epoch-ms)
  startsAt: bigint("starts_at", { mode: "number" }),
  expiresAt: bigint("expires_at", { mode: "number" }),

  // rep_daily ownership + idempotency
  ownerUserId: bigint("owner_user_id", { mode: "bigint" }).references(() => users.id),
  istDate: text("ist_date"),

  active: boolean("active").notNull().default(true),
  config: jsonb("config").$type<CouponConfig>(),
}, (t) => [
  index("coupons_kind_active_idx").on(t.kind, t.active),
  // One rep_daily coupon per rep per IST day.
  uniqueIndex("coupons_rep_daily_unq")
    .on(t.ownerUserId, t.istDate)
    .where(sql`${t.kind} = 'rep_daily'`),
]);

export const couponRedemptions = pgTable("coupon_redemptions", {
  ...baseColumns("cpr"),
  couponId: bigint("coupon_id", { mode: "bigint" }).notNull().references(() => coupons.id),
  userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id),
  orderId: bigint("order_id", { mode: "bigint" }).notNull().references(() => orders.id),
  redeemedBy: bigint("redeemed_by", { mode: "bigint" }).references(() => users.id),
  amountApplied: numeric("amount_applied", { precision: 10, scale: 2 }).notNull(),
  context: jsonb("context"),
}, (t) => [
  index("coupon_redemptions_coupon_idx").on(t.couponId),
  index("coupon_redemptions_user_idx").on(t.userId),
  index("coupon_redemptions_order_idx").on(t.orderId),
]);

export const ledgerDirection = pgEnum("ledger_direction", ["debit", "credit"]);
export const ledgerEntryType = pgEnum("ledger_entry_type", ["payment", "refund", "discount", "adjustment"]);

export const ledgerEntries = pgTable("ledger_entries", {
  ...baseColumns("led"),
  userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id),
  orderId: bigint("order_id", { mode: "bigint" }).references(() => orders.id),
  paymentId: bigint("payment_id", { mode: "bigint" }).references(() => payments.id),
  direction: ledgerDirection("direction").notNull(),
  type: ledgerEntryType("type").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  memo: text("memo"),
}, (t) => [
  index("ledger_user_created_idx").on(t.userId, t.createdAt),
  index("ledger_order_idx").on(t.orderId),
]);
