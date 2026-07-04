import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ne } from "drizzle-orm";
import { db } from "@/db/client";
import { featureFlags, userFeatureFlags, users } from "@/db/schema";
import { userFeatureFlagsService } from "../user-feature-flags.service";

let userId: string;
let flagId: string;

async function reset() {
  await db.delete(userFeatureFlags);
  await db.delete(users).where(ne(users.isSystem, true));
  await db.delete(featureFlags);
}

describe("userFeatureFlagsService.setFlag (integration)", () => {
  beforeEach(async () => {
    await reset();
    const [u] = await db.insert(users).values({ email: "uff@x.com", role: "user" }).returning();
    const [f] = await db.insert(featureFlags).values({ key: "k", label: "K", defaultEnabled: false }).returning();
    userId = u.publicId;
    flagId = f.publicId;
  });
  afterAll(reset);

  it("inserts an override on first set", async () => {
    await userFeatureFlagsService.setFlag(userId, flagId, true);
    const rows = await db.select().from(userFeatureFlags);
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBe(true);
  });

  it("updates the override on a second set (no duplicate row)", async () => {
    await userFeatureFlagsService.setFlag(userId, flagId, true);
    await userFeatureFlagsService.setFlag(userId, flagId, false);
    const rows = await db.select().from(userFeatureFlags);
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBe(false);
  });
});
