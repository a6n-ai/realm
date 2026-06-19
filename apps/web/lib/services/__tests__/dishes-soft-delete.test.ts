import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { dishesService } = await import("../dishes.service");

let id: string;
async function reset() { await db.delete(dishes); }
describe("dishesService soft-delete", () => {
  beforeEach(async () => {
    await reset();
    const [d] = await db.insert(dishes).values({ name: "Dal", diet: "veg", slots: ["lunch"] }).returning();
    id = d.id;
  });
  afterAll(reset);
  it("delete() flips active=false", async () => {
    await dishesService.delete(id);
    const [row] = await db.select().from(dishes).where(eq(dishes.id, id));
    expect(row.active).toBe(false);
  });
});
