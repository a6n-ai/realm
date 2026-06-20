import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { featureFlags, userFeatureFlags, users } from "@/db/schema";

export async function getEffectiveFlags(userPublicId: string): Promise<Record<string, boolean>> {
  const [userRow] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId)).limit(1);
  if (!userRow) return {};

  const flags = await db.select().from(featureFlags);
  const overrides = await db
    .select()
    .from(userFeatureFlags)
    .where(eq(userFeatureFlags.userId, userRow.id));

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
