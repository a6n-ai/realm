import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { organization } from "@/db/schema";

// requireAdmin needs a real request-scoped session; stub it like the other action
// tests (discounts-actions.test.ts) so the action runs outside a request. The
// point under test is the depth guard and the org row it produces.
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: async () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { createFranchise } = await import("../organizations-actions");

let createdOrgIds: string[] = [];

async function reset() {
  if (createdOrgIds.length) await db.delete(organization).where(inArray(organization.id, createdOrgIds));
  createdOrgIds = [];
}

describe("createFranchise (integration)", () => {
  afterEach(reset);

  it("creates a franchise parented to the given brand", async () => {
    const [brand] = await db
      .insert(organization)
      .values({ name: "Brand Y", clientCode: "test-brand-y" })
      .returning({ id: organization.id });
    createdOrgIds = [brand.id];

    const result = await createFranchise(brand.id, "Franchise Y1", "test-franchise-y1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      createdOrgIds.push(result.id);
      const [row] = await db.select().from(organization).where(eq(organization.id, result.id)).limit(1);
      expect(row.parentOrganizationId).toBe(brand.id);
      expect(row.clientCode).toBe("test-franchise-y1");
    }
  });

  it("rejects a third level (franchise parented to a franchise)", async () => {
    const [brand] = await db
      .insert(organization)
      .values({ name: "Brand Z", clientCode: "test-brand-z" })
      .returning({ id: organization.id });
    const [franchise] = await db
      .insert(organization)
      .values({ name: "Franchise Z1", clientCode: "test-franchise-z1", parentOrganizationId: brand.id })
      .returning({ id: organization.id });
    createdOrgIds = [brand.id, franchise.id];

    const result = await createFranchise(franchise.id, "Illegal Sub-Franchise", "test-illegal");

    expect(result.ok).toBe(false);
  });
});
