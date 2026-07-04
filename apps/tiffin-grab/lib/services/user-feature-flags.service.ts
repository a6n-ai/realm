import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { featureFlags, userFeatureFlags, users } from "@/db/schema";

export const userFeatureFlagsService = {
  async setFlag(userPublicId: string, flagPublicId: string, enabled: boolean): Promise<void> {
    const [[userRow], [flagRow]] = await Promise.all([
      db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId)).limit(1),
      db.select({ id: featureFlags.id }).from(featureFlags).where(eq(featureFlags.publicId, flagPublicId)).limit(1),
    ]);
    if (!userRow) throw new Error(`User not found: ${userPublicId}`);
    if (!flagRow) throw new Error(`Feature flag not found: ${flagPublicId}`);

    await db
      .insert(userFeatureFlags)
      .values({ userId: userRow.id, flagId: flagRow.id, enabled })
      .onConflictDoUpdate({
        target: [userFeatureFlags.userId, userFeatureFlags.flagId],
        set: { enabled, updatedAt: Date.now() },
      });
  },
};
