import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { durationPackages } from "@/db/schema";

// The editor actions go through requireAdmin() and revalidatePath(); stub both
// so the action path runs outside a request scope. The point under test is that
// the editor passes a public_id (NOT the bigint id) and the service resolves it.
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: async () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { retireItem, reactivateItem, saveItem } = await import(
  "@/app/(dashboard)/dashboard/catalog/actions"
);

// A weeks value no seed uses, so reset only ever touches this test's row.
const WEEKS = 97;
let publicId: string;
async function reset() {
  await db.delete(durationPackages).where(eq(durationPackages.weeks, WEEKS));
}

describe("catalog editor action round-trip (public_id resolves)", () => {
  beforeEach(async () => {
    await reset();
    const [z] = await db
      .insert(durationPackages)
      .values({ weeks: WEEKS, discountPct: 0 })
      .returning();
    publicId = z.publicId;
  });
  afterAll(reset);

  it("retire then reactivate via the action path flips active using the public_id", async () => {
    await retireItem("duration-packages", publicId);
    let [row] = await db.select().from(durationPackages).where(eq(durationPackages.publicId, publicId));
    expect(row.active).toBe(false);

    await reactivateItem("duration-packages", publicId);
    [row] = await db.select().from(durationPackages).where(eq(durationPackages.publicId, publicId));
    expect(row.active).toBe(true);
  });

  it("saveItem with a public_id edits the existing row (not a no-op)", async () => {
    await saveItem("duration-packages", publicId, { weeks: WEEKS, discountPct: 5 });
    const [row] = await db.select().from(durationPackages).where(eq(durationPackages.publicId, publicId));
    expect(row.discountPct).toBe(5);
  });
});
