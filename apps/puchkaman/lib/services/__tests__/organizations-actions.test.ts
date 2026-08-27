import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { member, organization, users } from "@/db/schema";

// requireAdmin needs a real request-scoped session; stub it like the other action
// tests so the action runs outside a request. The point under test is the depth
// guard and the org/member rows it produces.
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: async () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

// getSession is mocked directly (rather than relying on resolveActingUserId's
// admin fallback, which picks arbitrarily out of whatever admins already exist
// in a shared dev DB) so the acting user is deterministically the one this test
// created.
let sessionUserPublicId: string | null = null;
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => (sessionUserPublicId ? { user: { id: sessionUserPublicId }, session: { activeOrganizationId: null } } : null),
}));

const { createFranchise } = await import("../organizations-actions");

let createdOrgIds: string[] = [];
let createdUserIds: bigint[] = [];

async function reset() {
  if (createdOrgIds.length) await db.delete(organization).where(inArray(organization.id, createdOrgIds));
  if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  createdOrgIds = [];
  createdUserIds = [];
  sessionUserPublicId = null;
}

async function makeActingUser() {
  const [user] = await db
    .insert(users)
    .values({ name: "Acting Admin", email: `acting-${Math.random().toString(36).slice(2)}@test.invalid`, role: "admin" })
    .returning({ id: users.id, publicId: users.publicId });
  createdUserIds.push(user.id);
  sessionUserPublicId = user.publicId;
  return user;
}

describe("createFranchise (integration)", () => {
  afterEach(reset);

  it("creates a franchise parented to the given brand", async () => {
    const actingUser = await makeActingUser();
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
      const [memberRow] = await db
        .select()
        .from(member)
        .where(eq(member.organizationId, result.id))
        .limit(1);
      expect(memberRow.userId).toBe(actingUser.id);
      expect(memberRow.role).toBe("owner");
    }
  });

  it("rejects a third level (franchise parented to a franchise)", async () => {
    await makeActingUser();
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
