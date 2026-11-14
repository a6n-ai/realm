import { ValidationError } from "@foundry/commons";
import { SUPPORT_HOURS_DEFAULT, parseSupportHours, type SupportHours } from "./support-hours";
import { settingsCache, saveSetting } from "@/lib/settings";
import { db } from "@/db/client";
import { app } from "@/db/schema";

export async function getSupportHours(): Promise<SupportHours> {
  return settingsCache.getOrSet("supportHours", async () => {
    const [row] = await db.select({ sh: app.supportHours }).from(app).limit(1);
    try {
      return parseSupportHours(row?.sh);
    } catch {
      return SUPPORT_HOURS_DEFAULT;
    }
  });
}

export async function setSupportHours(input: unknown): Promise<void> {
  let cfg: SupportHours;
  try {
    cfg = parseSupportHours(input);
  } catch (e) {
    throw new ValidationError(e instanceof Error ? e.message : "Invalid support hours");
  }
  await saveSetting({ supportHours: cfg });
}
