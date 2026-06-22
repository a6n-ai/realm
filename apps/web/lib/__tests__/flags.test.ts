import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { featureFlags, userFeatureFlags, users } from "@/db/schema";
import { getEffectiveFlags, hasFlag } from "../flags";

let userId: string;
let userInternalId: bigint;

async function reset() {
  await db.delete(userFeatureFlags);
  await db.delete(users);
  await db.delete(featureFlags);
}

describe("feature-flag resolution (integration)", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(featureFlags).values([
      { key: "wizard", label: "Wizard", defaultEnabled: true },
      { key: "admin_console", label: "Admin", defaultEnabled: false },
    ]);
    const [u] = await db
      .insert(users)
      .values({ email: "f@x.com", role: "user" })
      .returning();
    userId = u.publicId;
    userInternalId = u.id;
  });
  afterAll(reset);

  it("returns defaults when the user has no overrides", async () => {
    const flags = await getEffectiveFlags(userId);
    expect(flags).toEqual({ wizard: true, admin_console: false });
  });

  it("applies a per-user override over the default", async () => {
    const [adminFlag] = await db.select().from(featureFlags).where(eq(featureFlags.key, "admin_console"));
    await db.insert(userFeatureFlags).values({ userId: userInternalId, flagId: adminFlag.id, enabled: true });
    expect(await hasFlag(userId, "admin_console")).toBe(true);
    expect(await hasFlag(userId, "wizard")).toBe(true);
  });
});
