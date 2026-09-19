import { UpdatableRepository } from "@foundry/database";
import { ValidationError, cutoffMsFor, tzToDefaultCountry } from "@foundry/commons";
import { parseAssumptions, type ProfitabilityAssumptions } from "@/lib/analytics/profitability";
import {
  parseIntegrationsConfig,
  type IntegrationsConfig,
  type IntegrationsConfigStore,
} from "@foundry/clover";
import { DEFAULT_PAYMENT_CONFIG, parsePaymentConfig, type PaymentConfig } from "@foundry/payments";
import type { Country as CountryCode } from "react-phone-number-input";
import { and, eq, gt } from "drizzle-orm";
import { sharedCache } from "@/lib/cache";
import { db } from "@/db/client";
import { app, deliveries } from "@/db/schema";
import { DEFAULT_MEAL_TYPES, parseMealTypes, type MealTypesSettings } from "@/lib/menu/meal-types";
import { couponKind, type DiscountPolicy } from "@/db/schema/coupons";
import type { LeadAssignmentConfig } from "./assignment";
import { SessionUpdatableService } from "./session-service";

const DEFAULTS = { timezone: "America/Toronto", cutoffHour: 18, currency: "INR", minTiffinsPerWeek: 3, maxTiffinsPerWeek: 7, maxDiscountPct: 25 } as const;
const ASSIGNMENT_DEFAULT: LeadAssignmentConfig = { strategy: "creator", perSource: {}, cursor: {} };
// Default discount governance: every kind honored, rep daily allowance OFF until
// an admin opts in and sets ceilings. Mirrors the leadAssignment default shape.
const DISCOUNT_POLICY_DEFAULT: DiscountPolicy = {
  enabledKinds: [...couponKind.enumValues],
  repDaily: { enabled: false, defaultCapPct: 0, defaultCapAmount: 0, defaultDailyUses: 1, perRep: {} },
};

// app_settings is a single global row read on hot paths (cutoff calc, every
// inbound inquiry's owner resolution) and written only by admins. Cache it; the
// concrete service below evicts on every write. 60s TTL bounds cross-instance
// staleness until a Redis tier broadcasts eviction.
const settingsCache = sharedCache("app-settings");

// Concrete service owns the cache eviction — NOT the drizzle base. Override each
// write to bust after super, mirroring the Java service's post-write evict.
class AppSettingsService extends SessionUpdatableService<typeof app> {
  async create(values: Record<string, unknown>): Promise<typeof app.$inferSelect> {
    const row = await super.create(values);
    await settingsCache.evictAll();
    return row;
  }

  async update(publicId: string, patch: Record<string, unknown>): Promise<typeof app.$inferSelect> {
    const row = await super.update(publicId, patch);
    await settingsCache.evictAll();
    return row;
  }
}

const appSettingsEntity = new AppSettingsService(
  new UpdatableRepository(db, app, app.publicId, app.id),
);

export async function getAppSettings(): Promise<{ timezone: string; cutoffHour: number; currency: string; defaultCountry: CountryCode; minTiffinsPerWeek: number; maxTiffinsPerWeek: number; maxDiscountPct: number }> {
  return settingsCache.getOrSet("settings", async () => {
    const [row] = await db.select().from(app).limit(1);
    const timezone = row?.timezone ?? DEFAULTS.timezone;
    return {
      timezone,
      cutoffHour: row?.cutoffHour ?? DEFAULTS.cutoffHour,
      currency: row?.currency ?? DEFAULTS.currency,
      minTiffinsPerWeek: row?.minTiffinsPerWeek ?? DEFAULTS.minTiffinsPerWeek,
      maxTiffinsPerWeek: row?.maxTiffinsPerWeek ?? DEFAULTS.maxTiffinsPerWeek,
      maxDiscountPct: row?.maxDiscountPct ?? DEFAULTS.maxDiscountPct,
      // Explicit admin setting wins; NULL falls back to the timezone-derived country.
      defaultCountry: (row?.defaultCountry as CountryCode | null) ?? tzToDefaultCountry(timezone),
    };
  });
}

export async function setAppSettings(input: {
  timezone: string;
  cutoffHour: number;
  currency?: string;
  defaultCountry?: CountryCode | null;
  defaultMaxPauses?: number | null;
  defaultMaxPauseDaysTotal?: number | null;
  defaultMaxPauseStretchDays?: number | null;
  minTiffinsPerWeek?: number;
  maxTiffinsPerWeek?: number;
  maxDiscountPct?: number;
}): Promise<void> {
  const [row0] = await db.select({ min: app.minTiffinsPerWeek, max: app.maxTiffinsPerWeek }).from(app).limit(1);
  const min = input.minTiffinsPerWeek ?? row0?.min ?? DEFAULTS.minTiffinsPerWeek;
  const max = input.maxTiffinsPerWeek ?? row0?.max ?? DEFAULTS.maxTiffinsPerWeek;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 7 || min > max) {
    throw new ValidationError("Tiffins per week must be whole numbers with 1 ≤ min ≤ max ≤ 7");
  }
  const maxDiscountPct = input.maxDiscountPct;
  if (maxDiscountPct !== undefined && (!Number.isInteger(maxDiscountPct) || maxDiscountPct < 0 || maxDiscountPct > 100)) {
    throw new ValidationError("Max discount must be a whole percent from 0 to 100");
  }
  const [row] = await db.select({ publicId: app.publicId, currency: app.currency }).from(app).limit(1);
  // currency is optional here (the general settings form may not send it yet);
  // preserve the existing value, falling back to the default.
  const patch = {
    timezone: input.timezone,
    cutoffHour: input.cutoffHour,
    currency: input.currency ?? row?.currency ?? DEFAULTS.currency,
    // undefined = leave unchanged; null = clear (unlimited / timezone fallback).
    minTiffinsPerWeek: min,
    maxTiffinsPerWeek: max,
    ...(maxDiscountPct !== undefined ? { maxDiscountPct } : {}),
    ...(input.defaultCountry !== undefined ? { defaultCountry: input.defaultCountry } : {}),
    ...(input.defaultMaxPauses !== undefined ? { defaultMaxPauses: input.defaultMaxPauses } : {}),
    ...(input.defaultMaxPauseDaysTotal !== undefined ? { defaultMaxPauseDaysTotal: input.defaultMaxPauseDaysTotal } : {}),
    ...(input.defaultMaxPauseStretchDays !== undefined ? { defaultMaxPauseStretchDays: input.defaultMaxPauseStretchDays } : {}),
  };
  if (row) {
    await appSettingsEntity.update(row.publicId, patch);
  } else {
    await appSettingsEntity.create(patch);
  }

  // Missed-ness must stay monotonic: rows whose cutoff already passed are terminal (they may
  // already have spawned a make-up). Only future rows adopt the new cutoff. Use `patch` (the
  // values just written) rather than getAppSettings(), which may still serve a stale cached read.
  const now = Date.now();
  const future = await db.select({ id: deliveries.id, deliveryDate: deliveries.deliveryDate })
    .from(deliveries).where(gt(deliveries.cutoffAt, now));
  for (const r of future) {
    // Re-check cutoffAt > now (same captured `now`) on the write itself: if this row's
    // cutoff lapsed between the SELECT and here, it may have already spawned a make-up
    // via reconcileMakeups running concurrently, making it terminal — overwriting it with
    // a new future cutoff would un-terminal-ize it and double-count a paid drop.
    await db.update(deliveries)
      .set({ cutoffAt: cutoffMsFor(r.deliveryDate, patch.cutoffHour, patch.timezone) })
      .where(and(eq(deliveries.id, r.id), gt(deliveries.cutoffAt, now)));
  }
}

// Raw stored value for the settings editor: NULL means "auto (from timezone)".
// getAppSettings resolves that fallback, so the form can't tell auto from explicit.
export async function getDefaultCountrySetting(): Promise<CountryCode | null> {
  const [row] = await db.select({ dc: app.defaultCountry }).from(app).limit(1);
  return (row?.dc as CountryCode | null) ?? null;
}

// Raw stored pause-limit defaults for the settings editor: NULL means unlimited
// (no client-side derivation to hide, unlike defaultCountry).
export async function getPauseDefaultsSetting(): Promise<{
  defaultMaxPauses: number | null;
  defaultMaxPauseDaysTotal: number | null;
  defaultMaxPauseStretchDays: number | null;
}> {
  const [row] = await db
    .select({
      defaultMaxPauses: app.defaultMaxPauses,
      defaultMaxPauseDaysTotal: app.defaultMaxPauseDaysTotal,
      defaultMaxPauseStretchDays: app.defaultMaxPauseStretchDays,
    })
    .from(app)
    .limit(1);
  return {
    defaultMaxPauses: row?.defaultMaxPauses ?? null,
    defaultMaxPauseDaysTotal: row?.defaultMaxPauseDaysTotal ?? null,
    defaultMaxPauseStretchDays: row?.defaultMaxPauseStretchDays ?? null,
  };
}

export async function getLeadAssignment(): Promise<LeadAssignmentConfig> {
  return settingsCache.getOrSet("assignment", async () => {
    const [row] = await db.select({ la: app.leadAssignment }).from(app).limit(1);
    return { ...ASSIGNMENT_DEFAULT, ...((row?.la as Partial<LeadAssignmentConfig>) ?? {}) };
  });
}

export async function setLeadAssignment(cfg: LeadAssignmentConfig): Promise<void> {
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (row) await appSettingsEntity.update(row.publicId, { leadAssignment: cfg });
  else await appSettingsEntity.create({ ...DEFAULTS, leadAssignment: cfg });
}

export async function getDiscountPolicy(): Promise<DiscountPolicy> {
  return settingsCache.getOrSet("discountPolicy", async () => {
    const [row] = await db.select({ dp: app.discountPolicy }).from(app).limit(1);
    const dp = (row?.dp as Partial<DiscountPolicy>) ?? {};
    return {
      enabledKinds: dp.enabledKinds ?? [...DISCOUNT_POLICY_DEFAULT.enabledKinds],
      repDaily: { ...DISCOUNT_POLICY_DEFAULT.repDaily, ...(dp.repDaily ?? {}) },
    };
  });
}

export async function setDiscountPolicy(policy: DiscountPolicy): Promise<void> {
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (row) await appSettingsEntity.update(row.publicId, { discountPolicy: policy });
  else await appSettingsEntity.create({ ...DEFAULTS, discountPolicy: policy });
}

// Enabled payment methods + per-method taxes. NULL/garbage → no methods (simulated mode),
// so the app keeps its current behavior until an admin enables one. Cached like discountPolicy.
export async function getPaymentConfig(): Promise<PaymentConfig> {
  return settingsCache.getOrSet("paymentConfig", async () => {
    const [row] = await db.select({ pc: app.paymentConfig }).from(app).limit(1);
    return parsePaymentConfig(row?.pc ?? undefined);
  });
}

export async function setPaymentConfig(cfg: PaymentConfig): Promise<void> {
  // parse-then-store: normalizes field defaults and rejects a malformed blob before it lands.
  const parsed = parsePaymentConfig(cfg);
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (row) await appSettingsEntity.update(row.publicId, { paymentConfig: parsed });
  else await appSettingsEntity.create({ ...DEFAULTS, paymentConfig: parsed });
}

/** Non-payment plugins (Clover, …) — same JSONB singleton pattern as payment_config. */
export async function getIntegrationsConfig(): Promise<IntegrationsConfig> {
  return settingsCache.getOrSet("integrationsConfig", async () => {
    const [row] = await db.select({ cfg: app.integrationsConfig }).from(app).limit(1);
    return parseIntegrationsConfig(row?.cfg ?? undefined);
  });
}

export async function setIntegrationsConfig(cfg: IntegrationsConfig): Promise<void> {
  const parsed = parseIntegrationsConfig(cfg);
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (row) await appSettingsEntity.update(row.publicId, { integrationsConfig: parsed });
  else await appSettingsEntity.create({ ...DEFAULTS, integrationsConfig: parsed });
}

export const integrationsConfigStore: IntegrationsConfigStore = {
  get: getIntegrationsConfig,
  set: setIntegrationsConfig,
};

export async function getMealTypes(): Promise<MealTypesSettings> {
  return settingsCache.getOrSet("mealTypes", async () => {
    const [row] = await db.select({ mt: app.mealTypes }).from(app).limit(1);
    if (!row?.mt) return DEFAULT_MEAL_TYPES;
    try {
      return parseMealTypes(row.mt);
    } catch {
      return DEFAULT_MEAL_TYPES;
    }
  });
}

export async function setMealTypes(cfg: MealTypesSettings): Promise<void> {
  const parsed = parseMealTypes(cfg);
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (row) await appSettingsEntity.update(row.publicId, { mealTypes: parsed });
  else await appSettingsEntity.create({ ...DEFAULTS, mealTypes: parsed });
}

// NULL = unlimited. Read on every award, so it's cached like the other settings.
export async function getMaxWalletBalance(): Promise<number | null> {
  return settingsCache.getOrSet("maxWalletBalance", async () => {
    const [row] = await db.select({ v: app.maxWalletBalance }).from(app).limit(1);
    return row?.v ?? null;
  });
}

export async function setMaxWalletBalance(cap: number | null): Promise<void> {
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (row) await appSettingsEntity.update(row.publicId, { maxWalletBalance: cap });
  else await appSettingsEntity.create({ ...DEFAULTS, maxWalletBalance: cap });
}

/**
 * Ceiling on the share of an order's PRE-TAX SUBTOTAL that coins may cover.
 * NULL = unlimited, which is the behaviour every install had before this
 * existed: coins were bounded only by the order's remaining balance.
 * Read on the checkout path, so cached like the rest.
 */
export async function getMaxCoinPctOfSubtotal(): Promise<number | null> {
  return settingsCache.getOrSet("maxCoinPctOfSubtotal", async () => {
    const [row] = await db.select({ v: app.maxCoinPctOfSubtotal }).from(app).limit(1);
    return row?.v ?? null;
  });
}

export async function setMaxCoinPctOfSubtotal(pct: number | null): Promise<void> {
  if (pct != null && (!Number.isInteger(pct) || pct < 0 || pct > 100)) {
    throw new ValidationError("Coin limit must be a whole percent between 0 and 100");
  }
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (row) await appSettingsEntity.update(row.publicId, { maxCoinPctOfSubtotal: pct });
  else await appSettingsEntity.create({ ...DEFAULTS, maxCoinPctOfSubtotal: pct });
}

/** Admin overrides for provincial sales tax rates; provinces absent here fall
 *  back to DEFAULT_PROVINCE_TAXES. */
export async function getProvinceTaxes(): Promise<Record<string, { name: string; ratePct: number }[]>> {
  return settingsCache.getOrSet("provinceTaxes", async () => {
    const [row] = await db.select({ v: app.provinceTaxes }).from(app).limit(1);
    return row?.v ?? {};
  });
}

export async function getProfitabilityAssumptions(): Promise<ProfitabilityAssumptions> {
  return settingsCache.getOrSet("profitabilityAssumptions", async () => {
    const [row] = await db.select({ v: app.profitabilityAssumptions }).from(app).limit(1);
    return parseAssumptions(row?.v);
  });
}

export async function setProfitabilityAssumptions(input: ProfitabilityAssumptions): Promise<void> {
  const parsed = parseAssumptions(input);
  for (const [k, v] of Object.entries(parsed)) {
    if (v > 1_000_000) throw new ValidationError(`${k} is too large`);
  }
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (row) await appSettingsEntity.update(row.publicId, { profitabilityAssumptions: parsed });
  else await appSettingsEntity.create({ ...DEFAULTS, profitabilityAssumptions: parsed });
}

export async function setProvinceTaxes(
  taxes: Record<string, { name: string; ratePct: number }[]>,
): Promise<void> {
  for (const [province, lines] of Object.entries(taxes)) {
    for (const l of lines) {
      if (!l.name?.trim()) throw new ValidationError(`Tax line for ${province} needs a name`);
      if (!(l.ratePct >= 0 && l.ratePct <= 100)) {
        throw new ValidationError(`Tax rate for ${province} must be between 0 and 100`);
      }
    }
  }
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (row) await appSettingsEntity.update(row.publicId, { provinceTaxes: taxes });
  else await appSettingsEntity.create({ ...DEFAULTS, provinceTaxes: taxes });
}
