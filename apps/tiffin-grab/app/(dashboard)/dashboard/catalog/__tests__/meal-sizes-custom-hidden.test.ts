import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mealSizeItems, mealSizes } from "@/db/schema";

vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { catalogListScope } = await import("../list-scope");
const { mealSizeService } = await import("@/lib/services/catalog.service");
const { findOrCreateCustomMealSize } = await import("@/lib/services/custom-meal.service");

let custom: { id: bigint; publicId: string };

async function dropCustom() {
  if (!custom) return;
  await db.delete(mealSizeItems).where(eq(mealSizeItems.mealSizeId, custom.id));
  await db.delete(mealSizes).where(eq(mealSizes.id, custom.id));
}

describe("generic Meal Sizes resource hides custom sizes", () => {
  beforeAll(async () => {
    const r = await findOrCreateCustomMealSize([{ category: "rice", planKey: "veg", tuAmount: 7 }], { actorId: null });
    custom = r;
  });
  afterAll(dropCustom);

  it("list query excludes custom rows", async () => {
    const rows = await db.select({ id: mealSizes.id }).from(mealSizes).where(and(eq(mealSizes.id, custom.id), catalogListScope("meal-sizes")));
    expect(rows).toEqual([]);
    const regular = await db.select({ id: mealSizes.id }).from(mealSizes).where(catalogListScope("meal-sizes")).limit(1);
    expect(regular.length).toBe(1);
  });

  it("scope is a no-op for other resources", () => {
    expect(catalogListScope("plans")).toBeUndefined();
  });

  it("update / retire / reactivate by id refuse a custom size", async () => {
    await expect(mealSizeService.update(custom.publicId, { name: "hacked" })).rejects.toThrow(/custom meal/i);
    await expect(mealSizeService.delete(custom.publicId)).rejects.toThrow(/custom meal/i);
    await expect(mealSizeService.update(custom.publicId, { active: true })).rejects.toThrow(/custom meal/i);
  });
});
