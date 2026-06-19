import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { addons } from "@/db/schema";

// Session services transitively evaluate NextAuth(); stub it for the node env.
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { addonService } = await import("../catalog.service");

let id: string;
async function reset() {
  await db.delete(addons);
}

describe("catalog soft-delete", () => {
  beforeEach(async () => {
    await reset();
    const [a] = await db.insert(addons).values({ key: "sat-test", name: "Sat", pricePerWeek: "15.00" }).returning();
    id = a.id;
  });
  afterAll(reset);

  it("delete() flips active=false instead of removing the row", async () => {
    await addonService.delete(id);
    const [row] = await db.select().from(addons).where(eq(addons.id, id));
    expect(row).toBeDefined();
    expect(row.active).toBe(false);
  });
});
