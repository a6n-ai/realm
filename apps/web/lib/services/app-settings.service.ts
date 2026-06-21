import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";

const DEFAULTS = { timezone: "America/Toronto", cutoffHour: 18 } as const;

export async function getAppSettings(): Promise<{ timezone: string; cutoffHour: number }> {
  const [row] = await db.select().from(appSettings).limit(1);
  if (!row) return { ...DEFAULTS };
  return { timezone: row.timezone, cutoffHour: row.cutoffHour };
}

export async function setAppSettings(input: { timezone: string; cutoffHour: number }): Promise<void> {
  const [row] = await db.select({ publicId: appSettings.publicId }).from(appSettings).limit(1);
  if (row) {
    await db.update(appSettings).set({ timezone: input.timezone, cutoffHour: input.cutoffHour }).where(eq(appSettings.publicId, row.publicId));
  } else {
    await db.insert(appSettings).values({ timezone: input.timezone, cutoffHour: input.cutoffHour });
  }
}
