import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { RESOURCES } from "../resource-config";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { dishCategories, plans } = await import("@/db/schema");
const { dishCategoriesService } = await import("@/lib/services/dish-categories.service");

// Test-owned keys that do not collide with the seed's real categories, so this
// suite never wipes the shared seed other live-DB suites depend on.
const KEY = "zzt-daal";
async function cleanup() {
  await db.delete(dishCategories).where(like(dishCategories.key, "zzt-%"));
}

describe("dish-categories resource registry", () => {
  it("is registered, keyed, with the expected fields", () => {
    const def = RESOURCES["dish-categories"];
    expect(def).toBeDefined();
    expect(def.keyed).toBe(true);
    expect(def.fields.map((f) => f.key)).toEqual(
      expect.arrayContaining(["key", "label", "planIds", "selectable", "sortOrder"]),
    );
  });

  it("schema accepts a valid category and requires at least one plan", () => {
    const s = RESOURCES["dish-categories"].schema;
    expect(() => s.parse({ key: "daal", label: "Daal", planIds: ["pln_veg"], selectable: false, sortOrder: "6" })).not.toThrow();
    // A slot on no plan would never appear on a menu.
    expect(() => s.parse({ key: "daal", label: "Daal", planIds: [], selectable: false, sortOrder: "6" })).toThrow();
  });
});

describe("dishCategoriesService CRUD (integration)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  // Slots attach to plans by public_id now, so the test needs a real one.
  let vegPlanPublicId: string;
  beforeEach(async () => {
    const [veg] = await db.select({ publicId: plans.publicId }).from(plans).where(eq(plans.key, "veg")).limit(1);
    vegPlanPublicId = veg.publicId;
  });

  it("creates an enabled category and soft-deletes via enabled=false", async () => {
    const row = await dishCategoriesService.create({ key: KEY, label: "Daal", planIds: [vegPlanPublicId], selectable: false, sortOrder: 6 });
    const [created] = await db.select().from(dishCategories).where(eq(dishCategories.publicId, row.publicId));
    expect(created.enabled).toBe(true);

    await dishCategoriesService.delete(row.publicId);
    const [after] = await db.select().from(dishCategories).where(eq(dishCategories.publicId, row.publicId));
    expect(after.enabled).toBe(false);

    // Generic reactivate path passes { active: true } → maps to enabled.
    await dishCategoriesService.update(row.publicId, { active: true });
    const [restored] = await db.select().from(dishCategories).where(eq(dishCategories.publicId, row.publicId));
    expect(restored.enabled).toBe(true);
  });

  it("enabledCategories surfaces created keys for the options source", async () => {
    await dishCategoriesService.create({ key: "zzt-daal", label: "Daal", planIds: [vegPlanPublicId], selectable: false, sortOrder: 6 });
    await dishCategoriesService.create({ key: "zzt-curry", label: "Curry", planIds: [vegPlanPublicId], selectable: true, sortOrder: 7 });
    await dishCategoriesService.create({ key: "zzt-extra", label: "Extra", planIds: [vegPlanPublicId], selectable: false, sortOrder: 8 });
    const keys = (await dishCategoriesService.enabledCategories()).map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(["zzt-daal", "zzt-curry", "zzt-extra"]));
  });
});
