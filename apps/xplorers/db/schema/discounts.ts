import { updatableColumns } from "@foundry/database";
import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, numeric, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { bookings, sessionCategory, studioSessions } from "./studio";

export const DISCOUNT_SCOPES = ["all", "category", "session"] as const;
export type DiscountScope = (typeof DISCOUNT_SCOPES)[number];
export const discountScope = pgEnum("discount_scope", [...DISCOUNT_SCOPES]);

/** One line taken off a booking. Positive dollars. Later kinds: "credit" | "wallet". */
export type Adjustment = {
  kind: "discount" | "coupon";
  publicId: string;
  name: string;
  code?: string;
  amount: number;
};

/** Price snapshot written on the booking at creation. Never re-derived later. */
export type BookingPricing = {
  subtotal: number;
  adjustments: Adjustment[];
  discountTotal: number;
  taxTotal: number;
  total: number;
};

/** Automatic discount, no code. */
export const discounts = pgTable(
  "discounts",
  {
    ...updatableColumns("dsc"),
    name: text("name").notNull(),
    scope: discountScope("scope").notNull().default("all"),
    category: sessionCategory("category"),
    sessionId: bigint("session_id", { mode: "bigint" }).references(() => studioSessions.id),
    percentOff: numeric("percent_off", { precision: 5, scale: 2 }),
    amountOff: numeric("amount_off", { precision: 10, scale: 2 }),
    minSubtotal: numeric("min_subtotal", { precision: 10, scale: 2 }),
    startsAt: bigint("starts_at", { mode: "number" }),
    endsAt: bigint("ends_at", { mode: "number" }),
    stackable: boolean("stackable").notNull().default(true),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    index("discounts_active_idx").on(t.active),
    check("discounts_one_value", sql`(${t.percentOff} IS NULL) <> (${t.amountOff} IS NULL)`),
    check(
      "discounts_scope_target",
      sql`(${t.scope} = 'all' AND ${t.category} IS NULL AND ${t.sessionId} IS NULL)
        OR (${t.scope} = 'category' AND ${t.category} IS NOT NULL AND ${t.sessionId} IS NULL)
        OR (${t.scope} = 'session' AND ${t.sessionId} IS NOT NULL AND ${t.category} IS NULL)`,
    ),
  ],
);

/** Typed-code coupon. `code` is stored trimmed and uppercase. */
export const coupons = pgTable(
  "coupons",
  {
    ...updatableColumns("cpn"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    percentOff: numeric("percent_off", { precision: 5, scale: 2 }),
    amountOff: numeric("amount_off", { precision: 10, scale: 2 }),
    minSubtotal: numeric("min_subtotal", { precision: 10, scale: 2 }),
    maxRedemptions: integer("max_redemptions"),
    maxPerUser: integer("max_per_user"),
    redemptionCount: integer("redemption_count").notNull().default(0),
    allowedPaymentMethods: text("allowed_payment_methods").array().notNull().default(sql`'{}'::text[]`),
    startsAt: bigint("starts_at", { mode: "number" }),
    expiresAt: bigint("expires_at", { mode: "number" }),
    stackable: boolean("stackable").notNull().default(false),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    uniqueIndex("coupons_code_idx").on(t.code),
    check("coupons_one_value", sql`(${t.percentOff} IS NULL) <> (${t.amountOff} IS NULL)`),
  ],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    ...updatableColumns("cpr"),
    couponId: bigint("coupon_id", { mode: "bigint" })
      .notNull()
      .references(() => coupons.id),
    bookingId: bigint("booking_id", { mode: "bigint" })
      .notNull()
      .references(() => bookings.id),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id),
    amountApplied: numeric("amount_applied", { precision: 10, scale: 2 }).notNull(),
  },
  (t) => [
    uniqueIndex("coupon_redemptions_coupon_booking_idx").on(t.couponId, t.bookingId),
    index("coupon_redemptions_coupon_user_idx").on(t.couponId, t.userId),
  ],
);
