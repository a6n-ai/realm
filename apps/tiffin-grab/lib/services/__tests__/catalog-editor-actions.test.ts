import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryZones, plans } from "@/db/schema";

// The editor actions go through requireAdmin() and revalidatePath(); stub both
// so the action path runs outside a request scope. The point under test is that
// the editor passes a public_id (NOT the bigint id) and the service resolves it.
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: async () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { retireItem, reactivateItem, saveItem } = await import(
  "@/app/(dashboard)/dashboard/catalog/actions"
);

let publicId: string;
async function reset() {
  await db.delete(deliveryZones);
}

describe("catalog editor action round-trip (public_id resolves)", () => {
  beforeEach(async () => {
    await reset();
    const [z] = await db
      .insert(deliveryZones)
      .values({ name: "Round Trip Zone", postalPrefixes: ["X1"], slotWindow: "9:00 AM – 11:00 AM" })
      .returning();
    publicId = z.publicId;
  });
  afterAll(reset);

  it("retire then reactivate via the action path flips active using the public_id", async () => {
    await retireItem("delivery-zones", publicId);
    let [row] = await db.select().from(deliveryZones).where(eq(deliveryZones.publicId, publicId));
    expect(row.active).toBe(false);

    await reactivateItem("delivery-zones", publicId);
    [row] = await db.select().from(deliveryZones).where(eq(deliveryZones.publicId, publicId));
    expect(row.active).toBe(true);
  });

  it("saveItem with a public_id edits the existing row (not a no-op)", async () => {
    await saveItem("delivery-zones", publicId, { name: "Renamed Zone", slotWindow: "1:00 PM – 3:00 PM" });
    const [row] = await db.select().from(deliveryZones).where(eq(deliveryZones.publicId, publicId));
    expect(row.name).toBe("Renamed Zone");
    expect(row.slotWindow).toBe("1:00 PM – 3:00 PM");
  });
});

describe("catalog editor action round-trip: plan category_counts", () => {
  const testKey = "test-category-counts-plan";
  async function resetPlan() {
    await db.delete(plans).where(eq(plans.key, testKey));
  }
  beforeEach(resetPlan);
  afterAll(resetPlan);

  it("creating a plan with categoryCounts persists it and derives offeredSlots", async () => {
    await saveItem("plans", null, { key: testKey, name: "Test CC Plan", planType: "tiffin", categoryCounts: { sabzi: 2 } });
    const [row] = await db.select().from(plans).where(eq(plans.key, testKey));
    expect(row.categoryCounts).toEqual({ sabzi: 2 });
    expect(row.offeredSlots).toEqual(["sabzi"]);
  });

  it("rejects a zero count via parseCategoryCounts", async () => {
    await expect(
      saveItem("plans", null, { key: testKey, name: "Test CC Plan", planType: "tiffin", categoryCounts: { sabzi: 0 } }),
    ).rejects.toThrow();
    const [row] = await db.select().from(plans).where(eq(plans.key, testKey));
    expect(row).toBeUndefined();
  });

  it("updating an existing plan's categoryCounts round-trips and re-derives offeredSlots", async () => {
    await saveItem("plans", null, { key: testKey, name: "Test CC Plan", planType: "tiffin", categoryCounts: { sabzi: 2 } });
    const [created] = await db.select().from(plans).where(eq(plans.key, testKey));

    await saveItem("plans", created.publicId, { categoryCounts: { rice: 1, roti: 2 } });
    const [row] = await db.select().from(plans).where(eq(plans.key, testKey));
    expect(row.categoryCounts).toEqual({ rice: 1, roti: 2 });
    expect(row.offeredSlots).toEqual(["rice", "roti"]);
  });
});
