import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// A separate file (not app-settings.service.test.ts): that suite's reset() does
// `db.delete(app)`, which FK-violates against `account` in this DB — a pre-existing
// failure unrelated to pause limits. This suite avoids deleting the singleton row;
// it snapshots + restores it instead.
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { app } = await import("@/db/schema");
const { setAppSettings, getPauseDefaultsSetting } = await import("../app-settings.service");

describe("app-settings pause-limit defaults (integration)", () => {
  let original: (typeof app.$inferSelect) | undefined;

  beforeAll(async () => {
    [original] = await db.select().from(app).limit(1);
  });

  afterAll(async () => {
    if (!original) return;
    await setAppSettings({
      timezone: original.timezone,
      cutoffHour: original.cutoffHour,
      currency: original.currency,
      defaultCountry: original.defaultCountry as never,
      defaultMaxPauses: original.defaultMaxPauses,
      defaultMaxPauseDaysTotal: original.defaultMaxPauseDaysTotal,
      defaultMaxPauseStretchDays: original.defaultMaxPauseStretchDays,
    });
  });

  it("persists the three pause-limit defaults and reads them back; empty input clears to null", async () => {
    await setAppSettings({
      timezone: "America/Toronto",
      cutoffHour: 18,
      defaultMaxPauses: 3,
      defaultMaxPauseDaysTotal: 10,
      defaultMaxPauseStretchDays: 5,
    });
    expect(await getPauseDefaultsSetting()).toEqual({
      defaultMaxPauses: 3,
      defaultMaxPauseDaysTotal: 10,
      defaultMaxPauseStretchDays: 5,
    });

    // Empty (null) input clears each field back to unlimited.
    await setAppSettings({
      timezone: "America/Toronto",
      cutoffHour: 18,
      defaultMaxPauses: null,
      defaultMaxPauseDaysTotal: null,
      defaultMaxPauseStretchDays: null,
    });
    expect(await getPauseDefaultsSetting()).toEqual({
      defaultMaxPauses: null,
      defaultMaxPauseDaysTotal: null,
      defaultMaxPauseStretchDays: null,
    });
  });
});
