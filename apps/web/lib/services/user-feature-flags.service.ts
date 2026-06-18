import { db } from "@/db/client";
import { userFeatureFlags } from "@/db/schema";

export const userFeatureFlagsService = {
  async setFlag(userId: string, flagId: string, enabled: boolean): Promise<void> {
    await db
      .insert(userFeatureFlags)
      .values({ userId, flagId, enabled })
      .onConflictDoUpdate({
        target: [userFeatureFlags.userId, userFeatureFlags.flagId],
        set: { enabled, updatedAt: new Date() },
      });
  },
};
