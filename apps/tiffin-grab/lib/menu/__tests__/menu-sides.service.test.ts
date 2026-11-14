import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSizeItems, mealSizes, menuDaySides, menuSideDefaults, menuWeeks } from "@/db/schema";
import { testPlanId } from "@/db/test-helpers";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { menuSidesService } = await import("../menu-sides.service");

// Its own week and its own (category, role) pair, so parallel suites never see these rows.
const WEEK = "2031-03-03";
const CATEGORY = "salad";
let weekPublicId: string;
let dishPublicId: string;
let markedItemId: bigint | undefined;

describe("menuSidesService", () => {
  beforeAll(async () => {
    await db.delete(menuWeeks).where(eq(menuWeeks.weekStart, WEEK));
    const [w] = await db.insert(menuWeeks).values({ weekStart: WEEK, status: "draft", orderCutoff: new Date("2999-01-01").getTime() }).returning();
    weekPublicId = w.publicId;
    const [d] = await db.insert(dishes).values({ planId: await testPlanId(), name: "SIDETEST-Toor Dal", category: "daal" }).returning();
    dishPublicId = d.publicId;
  });

  afterAll(async () => {
    await db.delete(menuWeeks).where(eq(menuWeeks.weekStart, WEEK));
    await db.delete(menuSideDefaults).where(eq(menuSideDefaults.role, "side_2"));
    await db.delete(dishes).where(eq(dishes.publicId, dishPublicId));
    if (markedItemId) await db.update(mealSizeItems).set({ role: "main" }).where(eq(mealSizeItems.id, markedItemId));
  });

  it("stores and clears the standing source for a side role", async () => {
    await menuSidesService.setDefault({ category: CATEGORY, role: "side_2", source: "daal" });
    await menuSidesService.setDefault({ category: CATEGORY, role: "side_2", source: "raita" });
    const rows = await db.select().from(menuSideDefaults).where(eq(menuSideDefaults.role, "side_2"));
    expect(rows).toHaveLength(1);
    await menuSidesService.setDefault({ category: CATEGORY, role: "side_2", source: null });
    expect(await db.select().from(menuSideDefaults).where(eq(menuSideDefaults.role, "side_2"))).toHaveLength(0);
  });

  it("sets a day's side to a category, then a dish, then back to the default", async () => {
    await menuSidesService.setDay({ weekId: weekPublicId, day: "tue", category: CATEGORY, role: "side_1", value: { kind: "category", key: "daal" } });
    expect(await menuSidesService.daySides(weekPublicId)).toEqual([
      { day: "tue", category: CATEGORY, role: "side_1", source: { kind: "category", key: "daal" } },
    ]);
    await menuSidesService.setDay({ weekId: weekPublicId, day: "tue", category: CATEGORY, role: "side_1", value: { kind: "dish", dishPublicId } });
    expect(await menuSidesService.daySides(weekPublicId)).toEqual([
      { day: "tue", category: CATEGORY, role: "side_1", source: { kind: "dish", dishPublicId } },
    ]);
    await menuSidesService.setDay({ weekId: weekPublicId, day: "tue", category: CATEGORY, role: "side_1", value: null });
    const [w] = await db.select({ id: menuWeeks.id }).from(menuWeeks).where(eq(menuWeeks.publicId, weekPublicId));
    expect(await db.select().from(menuDaySides).where(eq(menuDaySides.menuWeekId, w.id))).toHaveLength(0);
  });

  it("lists a side role with the meals that use it and its weight", async () => {
    const [item] = await db.select({ id: mealSizeItems.id, meal: mealSizes.name })
      .from(mealSizeItems).innerJoin(mealSizes, eq(mealSizes.id, mealSizeItems.mealSizeId))
      .where(and(eq(mealSizes.key, "item5_large_veg"), eq(mealSizeItems.category, "sabzi")))
      .orderBy(asc(mealSizeItems.sortOrder)).offset(1).limit(1);
    expect(item, "item5_large_veg has a second sabzi").toBeDefined();
    markedItemId = item!.id;
    await db.update(mealSizeItems).set({ role: "side_1" }).where(eq(mealSizeItems.id, item!.id));
    const slot = (await menuSidesService.sideSlots()).find((s) => s.category === "sabzi" && s.role === "side_1");
    expect(slot?.meals).toContain(`${item!.meal} (8oz)`);
  });
});
