import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { dishes, dishCategories, menuWeeks } = await import("@/db/schema");
const { menuService } = await import("../menu.service");

// Scope all mutation + cleanup to identifiers this suite owns, so it never wipes
// the shared seed that other live-DB suites depend on (fileParallelism is off).
const WEEK_STARTS = ["2099-05-04", "2099-05-11", "2099-05-18"];
const dishIds: string[] = [];

async function ensureCategories() {
  await db
    .insert(dishCategories)
    .values([
      { planType: "tiffin", key: "sabzi", label: "Sabzi", enabled: true, selectable: true, sortOrder: 1 },
      { planType: "tiffin", key: "rice", label: "Rice", enabled: true, selectable: false, sortOrder: 2 },
    ])
    .onConflictDoNothing();
}

async function cleanup() {
  const weeks = await db.select({ id: menuWeeks.id, publicId: menuWeeks.publicId }).from(menuWeeks).where(inArray(menuWeeks.weekStart, WEEK_STARTS));
  for (const w of weeks) await db.delete(menuWeeks).where(eq(menuWeeks.id, w.id)); // cascades menu_items
  if (dishIds.length) await db.delete(dishes).where(inArray(dishes.publicId, dishIds));
  dishIds.length = 0;
}

async function addDish(name: string, category: string | null) {
  const [d] = await db.insert(dishes).values({ name, diet: "veg", category }).returning();
  dishIds.push(d.publicId);
  return d;
}

describe("menuService.addItem category guard (I5)", () => {
  beforeEach(async () => {
    await cleanup();
    await ensureCategories();
  });
  afterAll(cleanup);

  it("rejects a dish whose category does not match the slot", async () => {
    const d = await addDish("Basmati (test)", "rice");
    const w = await menuService.upsertWeek({ planType: "tiffin", weekStart: WEEK_STARTS[0] });
    await expect(
      menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "sabzi", dishId: d.publicId, position: 0 }),
    ).rejects.toThrow(/category/i);
  });

  it("allows a dish whose category matches the slot", async () => {
    const d = await addDish("Aloo Gobi (test)", "sabzi");
    const w = await menuService.upsertWeek({ planType: "tiffin", weekStart: WEEK_STARTS[1] });
    const ok = await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "sabzi", dishId: d.publicId, position: 0 });
    expect(ok).toBeTruthy();
  });

  it("allows a null-category dish in any slot (back-compat)", async () => {
    const d = await addDish("Wildcard (test)", null);
    const w = await menuService.upsertWeek({ planType: "tiffin", weekStart: WEEK_STARTS[2] });
    const inSabzi = await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "sabzi", dishId: d.publicId, position: 0 });
    const inRice = await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "tue", slot: "rice", dishId: d.publicId, position: 0 });
    expect(inSabzi).toBeTruthy();
    expect(inRice).toBeTruthy();
  });
});
