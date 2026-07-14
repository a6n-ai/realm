import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { app, auditLog } = await import("@/db/schema");
const { getAppSettings, setAppSettings, getMealTypes, setMealTypes } = await import("../app-settings.service");
const { DEFAULT_MEAL_TYPES } = await import("@/lib/menu/meal-types");

async function reset() {
  await db.delete(auditLog);
  await db.delete(app);
}

describe("meal types", () => {
  beforeEach(reset);
  afterAll(reset);

  it("returns defaults when unset", async () => {
    expect(await getMealTypes()).toEqual(DEFAULT_MEAL_TYPES);
  });

  it("persists and reads back; rejects invalid", async () => {
    const cfg = { ...DEFAULT_MEAL_TYPES, tiffin: { ...DEFAULT_MEAL_TYPES.tiffin, titlePrefix: "Tiffin Specials" } };
    await setMealTypes(cfg);
    expect((await getMealTypes()).tiffin.titlePrefix).toBe("Tiffin Specials");
    await expect(setMealTypes({ tiffin: { accent: "nope", titlePrefix: "x" } } as never)).rejects.toThrow();
  });
});

describe("app-settings service (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("returns defaults when no row exists", async () => {
    const s = await getAppSettings();
    expect(s).toEqual({ timezone: "America/Toronto", cutoffHour: 18, currency: "INR", defaultCountry: "CA" });
  });

  it("resolves defaultCountry: explicit setting wins, else timezone fallback", async () => {
    // No explicit country + Kolkata timezone → tzToDefaultCountry fallback (IN).
    await setAppSettings({ timezone: "Asia/Kolkata", cutoffHour: 18 });
    expect((await getAppSettings()).defaultCountry).toBe("IN");
    // Explicit admin choice overrides the timezone-derived value.
    await setAppSettings({ timezone: "Asia/Kolkata", cutoffHour: 18, defaultCountry: "GB" });
    expect((await getAppSettings()).defaultCountry).toBe("GB");
    // Clearing back to null re-enables the fallback.
    await setAppSettings({ timezone: "Asia/Kolkata", cutoffHour: 18, defaultCountry: null });
    expect((await getAppSettings()).defaultCountry).toBe("IN");
  });

  it("creates then updates the singleton and audits both", async () => {
    await setAppSettings({ timezone: "America/Toronto", cutoffHour: 17 });
    let s = await getAppSettings();
    expect(s.cutoffHour).toBe(17);
    await setAppSettings({ timezone: "America/Toronto", cutoffHour: 19 });
    s = await getAppSettings();
    expect(s.cutoffHour).toBe(19);
    const rows = await db.select().from(app);
    expect(rows).toHaveLength(1); // still a singleton
    const audits = await db.select().from(auditLog).where(eq(auditLog.entity, "app"));
    expect(audits.some((r) => r.operation === "create")).toBe(true);
    expect(audits.some((r) => r.operation === "update")).toBe(true);
  });
});
