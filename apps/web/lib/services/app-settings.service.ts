import { LruTier, TieredCache } from "@tiffin/commons";
import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { DEFAULT_MEAL_TYPES, parseMealTypes, type MealTypesSettings } from "@/lib/menu/meal-types";
import { couponKind, type DiscountPolicy } from "@/db/schema/coupons";
import type { LeadAssignmentConfig } from "./assignment";
import { SessionUpdatableService } from "./session-service";

const DEFAULTS = { timezone: "America/Toronto", cutoffHour: 18 } as const;
const ASSIGNMENT_DEFAULT: LeadAssignmentConfig = { strategy: "creator", perSource: {}, cursor: {} };
// Default discount governance: every kind honored, rep daily allowance OFF until
// an admin opts in and sets ceilings. Mirrors the leadAssignment default shape.
const DISCOUNT_POLICY_DEFAULT: DiscountPolicy = {
  enabledKinds: [...couponKind.enumValues],
  repDaily: { enabled: false, defaultCapPct: 0, defaultCapAmount: 0, perRep: {} },
};

// app_settings is a single global row read on hot paths (cutoff calc, every
// inbound inquiry's owner resolution) and written only by admins. Cache it; the
// concrete service below evicts on every write. 60s TTL bounds cross-instance
// staleness until a Redis tier broadcasts eviction.
const settingsCache = new TieredCache({
  name: "app-settings",
  tiers: [new LruTier()],
  defaultTtlMs: 60_000,
});

// Concrete service owns the cache eviction — NOT the drizzle base. Override each
// write to bust after super, mirroring the Java service's post-write evict.
class AppSettingsService extends SessionUpdatableService<typeof appSettings> {
  async create(values: Record<string, unknown>): Promise<typeof appSettings.$inferSelect> {
    const row = await super.create(values);
    await settingsCache.evictAll();
    return row;
  }

  async update(publicId: string, patch: Record<string, unknown>): Promise<typeof appSettings.$inferSelect> {
    const row = await super.update(publicId, patch);
    await settingsCache.evictAll();
    return row;
  }
}

const appSettingsEntity = new AppSettingsService(
  new UpdatableRepository(db, appSettings, appSettings.publicId, appSettings.id),
);

export async function getAppSettings(): Promise<{ timezone: string; cutoffHour: number }> {
  return settingsCache.getOrSet("settings", async () => {
    const [row] = await db.select().from(appSettings).limit(1);
    if (!row) return { ...DEFAULTS };
    return { timezone: row.timezone, cutoffHour: row.cutoffHour };
  });
}

export async function setAppSettings(input: { timezone: string; cutoffHour: number }): Promise<void> {
  const [row] = await db.select({ publicId: appSettings.publicId }).from(appSettings).limit(1);
  if (row) {
    await appSettingsEntity.update(row.publicId, { timezone: input.timezone, cutoffHour: input.cutoffHour });
  } else {
    await appSettingsEntity.create({ timezone: input.timezone, cutoffHour: input.cutoffHour });
  }
}

export async function getLeadAssignment(): Promise<LeadAssignmentConfig> {
  return settingsCache.getOrSet("assignment", async () => {
    const [row] = await db.select({ la: appSettings.leadAssignment }).from(appSettings).limit(1);
    return { ...ASSIGNMENT_DEFAULT, ...((row?.la as Partial<LeadAssignmentConfig>) ?? {}) };
  });
}

export async function setLeadAssignment(cfg: LeadAssignmentConfig): Promise<void> {
  const [row] = await db.select({ publicId: appSettings.publicId }).from(appSettings).limit(1);
  if (row) await appSettingsEntity.update(row.publicId, { leadAssignment: cfg });
  else await appSettingsEntity.create({ ...DEFAULTS, leadAssignment: cfg });
}

export async function getDiscountPolicy(): Promise<DiscountPolicy> {
  return settingsCache.getOrSet("discountPolicy", async () => {
    const [row] = await db.select({ dp: appSettings.discountPolicy }).from(appSettings).limit(1);
    const dp = (row?.dp as Partial<DiscountPolicy>) ?? {};
    return {
      enabledKinds: dp.enabledKinds ?? [...DISCOUNT_POLICY_DEFAULT.enabledKinds],
      repDaily: { ...DISCOUNT_POLICY_DEFAULT.repDaily, ...(dp.repDaily ?? {}) },
    };
  });
}

export async function setDiscountPolicy(policy: DiscountPolicy): Promise<void> {
  const [row] = await db.select({ publicId: appSettings.publicId }).from(appSettings).limit(1);
  if (row) await appSettingsEntity.update(row.publicId, { discountPolicy: policy });
  else await appSettingsEntity.create({ ...DEFAULTS, discountPolicy: policy });
}

export async function getMealTypes(): Promise<MealTypesSettings> {
  return settingsCache.getOrSet("mealTypes", async () => {
    const [row] = await db.select({ mt: appSettings.mealTypes }).from(appSettings).limit(1);
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
  const [row] = await db.select({ publicId: appSettings.publicId }).from(appSettings).limit(1);
  if (row) await appSettingsEntity.update(row.publicId, { mealTypes: parsed });
  else await appSettingsEntity.create({ ...DEFAULTS, mealTypes: parsed });
}
