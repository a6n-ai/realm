import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { addons } from "@/db/schema";

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
  await db.delete(addons);
}

describe("catalog editor action round-trip (public_id resolves)", () => {
  beforeEach(async () => {
    await reset();
    const [a] = await db
      .insert(addons)
      .values({ key: "round-trip", name: "Round Trip", pricePerWeek: "12.00" })
      .returning();
    publicId = a.publicId;
  });
  afterAll(reset);

  it("retire then reactivate via the action path flips active using the public_id", async () => {
    await retireItem("addons", publicId);
    let [row] = await db.select().from(addons).where(eq(addons.publicId, publicId));
    expect(row.active).toBe(false);

    await reactivateItem("addons", publicId);
    [row] = await db.select().from(addons).where(eq(addons.publicId, publicId));
    expect(row.active).toBe(true);
  });

  it("saveItem with a public_id edits the existing row (not a no-op)", async () => {
    await saveItem("addons", publicId, { name: "Renamed", pricePerWeek: "99.00" });
    const [row] = await db.select().from(addons).where(eq(addons.publicId, publicId));
    expect(row.name).toBe("Renamed");
    expect(row.pricePerWeek).toBe("99.00");
  });
});
