import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { menuWeeks } = await import("@/db/schema");
const { menuService } = await import("../menu.service");

const WEEK = "2099-09-07";

describe("released week cache", () => {
  afterAll(async () => {
    await db.delete(menuWeeks).where(eq(menuWeeks.weekStart, WEEK));
  });

  it("serves a week released after an earlier miss at once", async () => {
    await db.delete(menuWeeks).where(eq(menuWeeks.weekStart, WEEK));
    const w = await menuService.upsertWeek({ weekStart: WEEK });
    expect(await menuService.getReleasedWeek(WEEK)).toBeNull();
    await menuService.markReady(w.publicId);
    await menuService.release(w.publicId);
    expect((await menuService.getReleasedWeek(WEEK))?.publicId).toBe(w.publicId);
  });
});
