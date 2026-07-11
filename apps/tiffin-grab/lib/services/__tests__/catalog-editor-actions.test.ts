import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryZones } from "@/db/schema";

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
