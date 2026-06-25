import { LruTier, TieredCache } from "@tiffin/commons";
import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import type { LeadAssignmentConfig } from "./assignment";
import { SessionUpdatableService } from "./session-service";

const DEFAULTS = { timezone: "America/Toronto", cutoffHour: 18 } as const;
const ASSIGNMENT_DEFAULT: LeadAssignmentConfig = { strategy: "creator", perSource: {}, cursor: {} };

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
