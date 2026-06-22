import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

const DEFAULTS = { timezone: "America/Toronto", cutoffHour: 18 } as const;

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
