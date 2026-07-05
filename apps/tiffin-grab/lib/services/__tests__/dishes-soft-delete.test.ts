import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { dishesService } = await import("../dishes.service");

const DISH_NAME = "SoftDelete Test Dish";
let publicId: string; let bigintId: bigint;
// Scope cleanup to this suite's own dish — a blanket `delete(dishes)` FK-fails
// on seeded menu_items/meal_selections that reference the seed catalog's dishes.
async function reset() { await db.delete(dishes).where(eq(dishes.name, DISH_NAME)); }
describe("dishesService soft-delete", () => {
  beforeEach(async () => {
    await reset();
    const [d] = await db.insert(dishes).values({ name: DISH_NAME, diet: "veg", slots: ["lunch"] }).returning();
    publicId = d.publicId;
    bigintId = d.id;
  });
  afterAll(reset);
  it("delete() flips active=false", async () => {
    await dishesService.delete(publicId);
    const [row] = await db.select().from(dishes).where(eq(dishes.id, bigintId));
    expect(row.active).toBe(false);
  });
});
