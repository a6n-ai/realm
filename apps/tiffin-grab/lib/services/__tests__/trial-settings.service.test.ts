import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveryFrequencies, trialSettings } = await import("@/db/schema");
const { getTrialSettings, setTrialSettings } = await import("../trial-settings.service");

describe("getTrialSettings", () => {
  beforeEach(() => db.delete(trialSettings));
  afterAll(() => db.delete(trialSettings));

  it("a franchise with no row of its own uses the app-wide row (admin saves from /dashboard with no org)", async () => {
    const [f] = await db.select({ key: deliveryFrequencies.key }).from(deliveryFrequencies).where(eq(deliveryFrequencies.active, true)).limit(1);
    await setTrialSettings({ frequencyKey: f!.key, maxDays: 1 }, null);

    expect((await getTrialSettings(null)).maxDays).toBe(1);
    expect((await getTrialSettings("org_without_own_row")).maxDays).toBe(1);
  });
});
