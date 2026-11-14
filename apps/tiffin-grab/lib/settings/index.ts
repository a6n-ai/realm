import { UpdatableRepository } from "@foundry/database";
import { ValidationError, tzToDefaultCountry, formatMoney } from "@foundry/commons";
import type { Country as CountryCode } from "react-phone-number-input";
import { configCache } from "@/lib/cache";
import { db } from "@/db/client";
import { APP_DEFAULTS, app } from "@/db/schema";
import { SessionUpdatableService } from "@/lib/services/session-service";

// app_settings is a single global row read on hot paths (cutoff calc, every
// inbound inquiry's owner resolution) and written only by admins. Cache it; the
// concrete service below evicts on every write. 60s TTL bounds cross-isolate
// staleness (each Worker isolate holds its own L1 copy).
export const settingsCache = configCache("app-settings");

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

// The one place the app row is written or first created; goes through the entity so the cache is evicted.
export async function saveSetting(patch: Record<string, unknown>): Promise<void> {
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (row) await appSettingsEntity.update(row.publicId, patch);
  else await appSettingsEntity.create({ ...APP_DEFAULTS, ...patch });
}

export async function getAppSettings(): Promise<{ timezone: string; cutoffHour: number; currency: string; defaultCountry: CountryCode; minTiffinsPerWeek: number; maxTiffinsPerWeek: number; maxDiscountPct: number }> {
  return settingsCache.getOrSet("settings", async () => {
    const [row] = await db.select().from(app).limit(1);
    const timezone = row?.timezone ?? APP_DEFAULTS.timezone;
    return {
      timezone,
      cutoffHour: row?.cutoffHour ?? APP_DEFAULTS.cutoffHour,
      currency: row?.currency ?? APP_DEFAULTS.currency,
      minTiffinsPerWeek: row?.minTiffinsPerWeek ?? APP_DEFAULTS.minTiffinsPerWeek,
      maxTiffinsPerWeek: row?.maxTiffinsPerWeek ?? APP_DEFAULTS.maxTiffinsPerWeek,
      maxDiscountPct: row?.maxDiscountPct ?? APP_DEFAULTS.maxDiscountPct,
      // Explicit admin setting wins; NULL falls back to the timezone-derived country.
      defaultCountry: (row?.defaultCountry as CountryCode | null) ?? tzToDefaultCountry(timezone),
    };
  });
}

export async function getMoneyFormatter(opts?: { whole?: boolean; narrow?: boolean }): Promise<(amount: number) => string> {
  const { currency } = await getAppSettings();
  return (amount) => formatMoney(amount, currency, opts);
}

export async function saveGeneralSettings(input: {
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
  const min = input.minTiffinsPerWeek ?? row0?.min ?? APP_DEFAULTS.minTiffinsPerWeek;
  const max = input.maxTiffinsPerWeek ?? row0?.max ?? APP_DEFAULTS.maxTiffinsPerWeek;
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
    currency: input.currency ?? row?.currency ?? APP_DEFAULTS.currency,
    // undefined = leave unchanged; null = clear (unlimited / timezone fallback).
    minTiffinsPerWeek: min,
    maxTiffinsPerWeek: max,
    ...(maxDiscountPct !== undefined ? { maxDiscountPct } : {}),
    ...(input.defaultCountry !== undefined ? { defaultCountry: input.defaultCountry } : {}),
    ...(input.defaultMaxPauses !== undefined ? { defaultMaxPauses: input.defaultMaxPauses } : {}),
    ...(input.defaultMaxPauseDaysTotal !== undefined ? { defaultMaxPauseDaysTotal: input.defaultMaxPauseDaysTotal } : {}),
    ...(input.defaultMaxPauseStretchDays !== undefined ? { defaultMaxPauseStretchDays: input.defaultMaxPauseStretchDays } : {}),
  };
  await saveSetting(patch);
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
