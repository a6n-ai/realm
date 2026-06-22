import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { appSettings, auditLog } = await import("@/db/schema");
const { getAppSettings, setAppSettings } = await import("../app-settings.service");

async function reset() {
  await db.delete(auditLog);
  await db.delete(appSettings);
}

describe("app-settings service (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("returns defaults when no row exists", async () => {
    const s = await getAppSettings();
    expect(s).toEqual({ timezone: "America/Toronto", cutoffHour: 18 });
  });

  it("creates then updates the singleton and audits both", async () => {
    await setAppSettings({ timezone: "America/Toronto", cutoffHour: 17 });
    let s = await getAppSettings();
    expect(s.cutoffHour).toBe(17);
    await setAppSettings({ timezone: "America/Toronto", cutoffHour: 19 });
    s = await getAppSettings();
    expect(s.cutoffHour).toBe(19);
    const rows = await db.select().from(appSettings);
    expect(rows).toHaveLength(1); // still a singleton
    const audits = await db.select().from(auditLog).where(eq(auditLog.entity, "app_settings"));
    expect(audits.some((r) => r.operation === "create")).toBe(true);
    expect(audits.some((r) => r.operation === "update")).toBe(true);
  });
});
