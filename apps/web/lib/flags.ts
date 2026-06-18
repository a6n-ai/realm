import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { featureFlags, userFeatureFlags } from "@/db/schema";

export async function getEffectiveFlags(userId: string): Promise<Record<string, boolean>> {
  const flags = await db.select().from(featureFlags);
  const overrides = await db
    .select()
    .from(userFeatureFlags)
    .where(eq(userFeatureFlags.userId, userId));

  const overrideByFlagId = new Map(overrides.map((o) => [o.flagId, o.enabled]));
  const result: Record<string, boolean> = {};
  for (const flag of flags) {
    result[flag.key] = overrideByFlagId.has(flag.id)
      ? Boolean(overrideByFlagId.get(flag.id))
      : flag.defaultEnabled;
  }
  return result;
}

export async function hasFlag(userId: string, key: string): Promise<boolean> {
  const flags = await getEffectiveFlags(userId);
  return flags[key] ?? false;
}
