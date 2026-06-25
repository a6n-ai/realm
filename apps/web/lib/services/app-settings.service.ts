import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import type { LeadAssignmentConfig } from "./assignment";
import { SessionUpdatableService } from "./session-service";

const DEFAULTS = { timezone: "America/Toronto", cutoffHour: 18 } as const;
const ASSIGNMENT_DEFAULT: LeadAssignmentConfig = { strategy: "creator", perSource: {}, cursor: {} };

const appSettingsEntity = new SessionUpdatableService(
  new UpdatableRepository(db, appSettings, appSettings.publicId, appSettings.id),
);

export async function getAppSettings(): Promise<{ timezone: string; cutoffHour: number }> {
  const [row] = await db.select().from(appSettings).limit(1);
  if (!row) return { ...DEFAULTS };
  return { timezone: row.timezone, cutoffHour: row.cutoffHour };
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
  const [row] = await db.select({ la: appSettings.leadAssignment }).from(appSettings).limit(1);
  return { ...ASSIGNMENT_DEFAULT, ...((row?.la as Partial<LeadAssignmentConfig>) ?? {}) };
}

export async function setLeadAssignment(cfg: LeadAssignmentConfig): Promise<void> {
  const [row] = await db.select({ publicId: appSettings.publicId }).from(appSettings).limit(1);
  if (row) await appSettingsEntity.update(row.publicId, { leadAssignment: cfg });
  else await appSettingsEntity.create({ ...DEFAULTS, leadAssignment: cfg });
}
