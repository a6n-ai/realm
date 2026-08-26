import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { inArray, like } from "drizzle-orm";

const { db } = await import("@/db/client");
const { organization, member, users } = await import("@/db/schema");
const { getMemberOrganizations, listOrganizations, addMember, removeMember, listMembers, listMembershipsForUser } =
  await import("../organizations.service");

// Scoped to this file's own fixtures (clientCode "test-*", email "*@test.invalid")
// rather than a blanket delete: organizations-actions.test.ts runs concurrently
// against the same DB and creates its own brand/franchise orgs, which an
// unpredicated reset() here could delete out from under its createFranchise calls.
async function reset() {
  const testOrgs = await db
    .select({ id: organization.id })
    .from(organization)
    .where(like(organization.clientCode, "test-%"));
  const testOrgIds = testOrgs.map((o) => o.id);
  if (testOrgIds.length) await db.delete(member).where(inArray(member.organizationId, testOrgIds));
  await db.delete(organization).where(like(organization.clientCode, "test-%"));
  await db.delete(users).where(like(users.email, "%@test.invalid"));
}

describe("getMemberOrganizations (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("returns every org the user has a member row in", async () => {
    const [orgA] = await db
      .insert(organization)
      .values({ name: "Org A", clientCode: "test-org-a" })
      .returning({ id: organization.id });
    const [orgB] = await db
      .insert(organization)
      .values({ name: "Org B", clientCode: "test-org-b" })
      .returning({ id: organization.id });
    const [user] = await db
      .insert(users)
      .values({ name: "Multi Org", email: `multi-${Math.random().toString(36).slice(2)}@test.invalid`, role: "admin" })
      .returning({ id: users.id, publicId: users.publicId });
    await db
      .insert(member)
      .values([
        { organizationId: orgA.id, userId: user.id, role: "admin" },
        { organizationId: orgB.id, userId: user.id, role: "admin" },
      ]);

    const result = await getMemberOrganizations({ user: { id: user.publicId } });

    expect(result.map((r) => r.id).sort()).toEqual([orgA.id, orgB.id].sort());
  });

  it("returns an empty list for a session with no member rows", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "No Org", email: `noorg-${Math.random().toString(36).slice(2)}@test.invalid`, role: "admin" })
      .returning({ publicId: users.publicId });

    const result = await getMemberOrganizations({ user: { id: user.publicId } });

    expect(result).toEqual([]);
  });

  it("returns an empty list for a null session", async () => {
    const result = await getMemberOrganizations(null);
    expect(result).toEqual([]);
  });
});

describe("listOrganizations (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("returns every org with its member count", async () => {
    const [brand] = await db
      .insert(organization)
      .values({ name: "Brand X", clientCode: "test-brand-x" })
      .returning({ id: organization.id });
    const [franchise] = await db
      .insert(organization)
      .values({ name: "Franchise X1", clientCode: "test-franchise-x1", parentOrganizationId: brand.id })
      .returning({ id: organization.id });
    const [user] = await db
      .insert(users)
      .values({ name: "Member", email: `member-${Math.random().toString(36).slice(2)}@test.invalid`, role: "admin" })
      .returning({ id: users.id });
    await db.insert(member).values({ organizationId: brand.id, userId: user.id, role: "admin" });

    const result = await listOrganizations();
    const brandRow = result.find((r) => r.id === brand.id);
    const franchiseRow = result.find((r) => r.id === franchise.id);

    expect(brandRow?.memberCount).toBe(1);
    expect(franchiseRow?.memberCount).toBe(0);
    expect(franchiseRow?.parentOrganizationId).toBe(brand.id);
  });
});

describe("member add/remove (integration)", () => {
  afterEach(reset);

  it("addMember creates a member row, removeMember deletes it", async () => {
    const [org] = await db
      .insert(organization)
      .values({ name: "Org M", clientCode: "test-org-m" })
      .returning({ id: organization.id });
    const [user] = await db
      .insert(users)
      .values({ name: "Addable", email: `addable-${Math.random().toString(36).slice(2)}@test.invalid`, role: "admin" })
      .returning({ id: users.id, publicId: users.publicId });

    await addMember(org.id, user.publicId, "admin");
    let rows = await listMembers(org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toContain("addable-");

    await removeMember(org.id, user.publicId);
    rows = await listMembers(org.id);
    expect(rows).toHaveLength(0);
  });
});

describe("listMembershipsForUser (integration)", () => {
  afterEach(reset);

  it("returns every org this user is a member of", async () => {
    const [org] = await db
      .insert(organization)
      .values({ name: "Org N", clientCode: "test-org-n" })
      .returning({ id: organization.id });
    const [user] = await db
      .insert(users)
      .values({ name: "Belongs", email: `belongs-${Math.random().toString(36).slice(2)}@test.invalid`, role: "admin" })
      .returning({ id: users.id, publicId: users.publicId });
    await db.insert(member).values({ organizationId: org.id, userId: user.id, role: "admin" });

    const result = await listMembershipsForUser(user.publicId);

    expect(result).toEqual([{ organizationId: org.id, organizationName: "Org N", role: "admin" }]);
  });
});
