import { updatableColumns } from "@foundry/database";
import { integer, jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";
import type { IntegrationsConfig } from "@foundry/clover";
import type { PaymentConfig } from "@foundry/payments";
import type { DiscountPolicy } from "./coupons";
import { APP_DEFAULTS } from "./app-defaults";

/** One weekday's support window, "HH:MM" 24h in the app timezone. */
export type DayHours = { open: string; close: string };

export type SupportHours = {
  /** Index 0 = Sunday (JS `getDay`). null = no support that day. */
  days: (DayHours | null)[];
  /** Usual time to a first reply, in hours. null = not promised. */
  replyWithinHours: number | null;
};

export { APP_DEFAULTS };

// The app/tenant entity (formerly app_settings): one row today. Holds currency,
// timezone and other settings that other tables resolve through their app_id FK.
export const app = pgTable("app", {
  ...updatableColumns("aps"),
  timezone: text("timezone").notNull().default(APP_DEFAULTS.timezone),
  cutoffHour: integer("cutoff_hour").notNull().default(APP_DEFAULTS.cutoffHour),
  // Fallback pause limits when a duration_packages column is null. null here = unlimited.
  defaultMaxPauses: integer("default_max_pauses"),
  defaultMaxPauseDaysTotal: integer("default_max_pause_days_total"),
  defaultMaxPauseStretchDays: integer("default_max_pause_stretch_days"),
  // Bounds on how many eating days (= tiffins per week) a customer may pick,
  // independent of the delivery frequency.
  minTiffinsPerWeek: integer("min_tiffins_per_week").notNull().default(APP_DEFAULTS.minTiffinsPerWeek),
  maxTiffinsPerWeek: integer("max_tiffins_per_week").notNull().default(APP_DEFAULTS.maxTiffinsPerWeek),
  // Cap on the SUM of catalog discount percents (delivery + duration) applied to the tiffin subtotal.
  maxDiscountPct: integer("max_discount_pct").notNull().default(APP_DEFAULTS.maxDiscountPct),
  currency: text("currency").notNull().default(APP_DEFAULTS.currency),
  // ISO 3166-1 alpha-2 country the phone-number inputs default to. NULL = derive
  // from timezone (tzToDefaultCountry) so existing rows keep their current behavior.
  defaultCountry: text("default_country"),
  leadAssignment: jsonb("lead_assignment"),
  // Notification events routed through the tracked SES stream (open/click). NULL = none.
  trackedEmailEvents: jsonb("tracked_email_events").$type<string[]>(),
  mealTypes: jsonb("meal_types"),
  discountPolicy: jsonb("discount_policy").$type<DiscountPolicy>(),
  // Enabled payment methods + per-method tax lines. NULL/empty → simulated mode.
  paymentConfig: jsonb("payment_config").$type<PaymentConfig>(),
  // Non-payment plugins (Clover, …). NULL/empty → nothing installed.
  integrationsConfig: jsonb("integrations_config").$type<IntegrationsConfig>(),
  // Support hours per weekday + usual reply time, shown to customers in Support. NULL = not set.
  supportHours: jsonb("support_hours").$type<SupportHours>(),
  // Ceiling on how many coins a single wallet can hold from new awards. NULL = unlimited.
  maxWalletBalance: integer("max_wallet_balance"),
  // Ceiling on how much of an order's PRE-TAX SUBTOTAL a customer may settle
  // with coins, as a whole percent. NULL = unlimited (pre-existing behaviour,
  // where coins were capped only by the order's remaining balance).
  maxCoinPctOfSubtotal: integer("max_coin_pct_of_subtotal"),
  // Ceiling on the percentage of the customer's total wallet balance they may
  // redeem on a single order. NULL = unlimited.
  maxCoinRedeemPctOfBalance: integer("max_coin_redeem_pct_of_balance"),
  // Share of a paid order's pre-tax amount returned as coins, percent with up to
  // 2 decimals (2.5 = $200 earns $5). 0 = earning off.
  coinEarnPct: numeric("coin_earn_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
  // Referral rewards. Mode "flat" = coins; "pct" = whole percent of the friend's
  // first paid order (pre-tax, like coin_earn_pct). Both values 0 = referrals off.
  referralMode: text("referral_mode").$type<"flat" | "pct">().notNull().default("flat"),
  referralReferrerValue: integer("referral_referrer_value").notNull().default(0),
  referralFriendValue: integer("referral_friend_value").notNull().default(0),
  // Max rewarded referrals per referrer. NULL = no limit.
  referralMaxPerReferrer: integer("referral_max_per_referrer"),
  // Per-province sales tax overrides, shaped { ON: [{name, ratePct}], ... }.
  // NULL/absent province falls back to DEFAULT_PROVINCE_TAXES in lib/tax/canada.
  provinceTaxes: jsonb("province_taxes").$type<Record<string, { name: string; ratePct: number }[]>>(),
  // Kitchen/driver per-tiffin costs and monthly Marketing/Salary/Other budgets
  // used by Analytics → Daily Profitability. NULL = all zeros (no costs entered).
  profitabilityAssumptions: jsonb("profitability_assumptions").$type<{
    kitchenCostPerTiffin: number;
    driverCostPerTiffin: number;
    otherCostPerTiffin: number;
    marketingMonthly: number;
    salaryMonthly: number;
    otherMonthly: number;
  }>(),
});
