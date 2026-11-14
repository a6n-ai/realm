import { ValidationError } from "@foundry/commons";
import { settingsCache, saveSetting } from "@/lib/settings";
import { db } from "@/db/client";
import { app } from "@/db/schema";

/** Admin overrides for provincial sales tax rates; provinces absent here fall
 *  back to DEFAULT_PROVINCE_TAXES. */
export async function getProvinceTaxes(): Promise<Record<string, { name: string; ratePct: number }[]>> {
  return settingsCache.getOrSet("provinceTaxes", async () => {
    const [row] = await db.select({ v: app.provinceTaxes }).from(app).limit(1);
    return row?.v ?? {};
  });
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
  await saveSetting({ provinceTaxes: taxes });
}
