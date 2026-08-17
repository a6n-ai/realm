import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { app, auditLog } = await import("@/db/schema");
const { getAppSettings, setAppSettings, getMealTypes, setMealTypes } = await import("../app-settings.service");
const { DEFAULT_MEAL_TYPES } = await import("@/lib/menu/meal-types");

// `app` is the one tenant row every other table's app_id FK points at (seeded
// catalog, audit history, …) — an unscoped `delete from app` always 23503s. Bypass FK
// enforcement for one transaction (SET LOCAL scopes it to that tx/connection only)
// rather than actually deleting the referenced rows, and always restore the original
// row afterward so later suites still see real seed data.
let originalApp: (typeof app.$inferSelect) | undefined;

beforeAll(async () => {
  [originalApp] = await db.select().from(app).limit(1);
});

// Pure-read tests ("no row exists") can use a genuinely empty table — getAppSettings/
// getMealTypes only SELECT. Setter-driven tests cannot: every table's app_id column
// defaults to current_app_id(), which is `SELECT id FROM app LIMIT 1` — with app empty
// that resolves to NULL and even INSERT INTO app itself 23502s on its own app_id
// column. So a real "create the singleton from nothing" flow only works via the
// hand-written self-referencing INSERT in db/seed.sql; the service layer (like every
// other production write) requires the row to already exist. Setter tests reset the
// row's columns back to schema defaults instead of deleting it.
async function clearAppSingleton() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.delete(auditLog).where(eq(auditLog.entity, "app"));
    await tx.delete(app);
  });
}

async function resetAppToDefaults() {
  // A prior test in this file may have called clearAppSingleton() and left the
  // row absent — restore it (same id, so category_plans/audit_log FKs stay valid)
  // before updating it back to defaults.
  const [row] = await db.select({ id: app.id }).from(app).limit(1);
  if (!row && originalApp) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.insert(app).values(originalApp!);
    });
  }
  await db.update(app).set({
    timezone: "America/Toronto",
    cutoffHour: 18,
    defaultMaxPauses: null,
    defaultMaxPauseDaysTotal: null,
    defaultMaxPauseStretchDays: null,
    currency: "INR",
    defaultCountry: null,
    leadAssignment: null,
    mealTypes: null,
    discountPolicy: null,
    paymentConfig: null,
    integrationsConfig: null,
    maxWalletBalance: null,
  });
  await db.delete(auditLog).where(eq(auditLog.entity, "app"));
}

async function restoreAppSingleton() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.delete(auditLog).where(eq(auditLog.entity, "app"));
    await tx.delete(app);
    if (originalApp) await tx.insert(app).values(originalApp);
  });
}

describe("meal types", () => {
  afterAll(restoreAppSingleton);

  it("returns defaults when unset", async () => {
    await clearAppSingleton();
    expect(await getMealTypes()).toEqual(DEFAULT_MEAL_TYPES);
  });

  it("persists and reads back; rejects invalid", async () => {
    await resetAppToDefaults();
    const cfg = { ...DEFAULT_MEAL_TYPES, tiffin: { ...DEFAULT_MEAL_TYPES.tiffin, titlePrefix: "Tiffin Specials" } };
    await setMealTypes(cfg);
    expect((await getMealTypes()).tiffin.titlePrefix).toBe("Tiffin Specials");
    await expect(setMealTypes({ tiffin: { accent: "nope", titlePrefix: "x" } } as never)).rejects.toThrow();
  });
});

describe("app-settings service (integration)", () => {
  afterAll(restoreAppSingleton);

  it("returns defaults when no row exists", async () => {
    await clearAppSingleton();
    const s = await getAppSettings();
    expect(s).toEqual({ timezone: "America/Toronto", cutoffHour: 18, currency: "INR", defaultCountry: "CA" });
  });

  it("resolves defaultCountry: explicit setting wins, else timezone fallback", async () => {
    await resetAppToDefaults();
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

  it("updates the singleton and audits it", async () => {
    await resetAppToDefaults();
    await setAppSettings({ timezone: "America/Toronto", cutoffHour: 17 });
    let s = await getAppSettings();
    expect(s.cutoffHour).toBe(17);
    await setAppSettings({ timezone: "America/Toronto", cutoffHour: 19 });
    s = await getAppSettings();
    expect(s.cutoffHour).toBe(19);
    const rows = await db.select().from(app);
    expect(rows).toHaveLength(1); // still a singleton
    const audits = await db.select().from(auditLog).where(eq(auditLog.entity, "app"));
    expect(audits.some((r) => r.operation === "update")).toBe(true);
  });
});
