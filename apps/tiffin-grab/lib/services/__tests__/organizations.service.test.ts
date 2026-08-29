import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";

const { db } = await import("@/db/client");
const { organization, member, users } = await import("@/db/schema");
const {
  getMemberOrganizations,
  listOrganizations,
  addMember,
  removeMember,
  listMembers,
  listMembershipsForUser,
  updateOrganization,
  searchUsersByEmail,
  updateMemberRole,
} = await import("../organizations.service");

// Scoped to this file's own fixtures (clientCode "test-svc-*", email "*@test.invalid")
// rather than a blanket delete: organizations-actions.test.ts runs concurrently
// against the same DB and creates its own "test-*"-prefixed brand/franchise orgs,
// which an unpredicated reset() here could delete out from under its createFranchise calls.
async function reset() {
  const testOrgs = await db
    .select({ id: organization.id })
    .from(organization)
    .where(like(organization.clientCode, "test-svc-%"));
  const testOrgIds = testOrgs.map((o) => o.id);
  if (testOrgIds.length) await db.delete(member).where(inArray(member.organizationId, testOrgIds));
  await db.delete(organization).where(like(organization.clientCode, "test-svc-%"));
  await db.delete(users).where(like(users.email, "%@test.invalid"));
}

describe("getMemberOrganizations (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("returns every org the user has a member row in", async () => {
    const [orgA] = await db
      .insert(organization)
      .values({ name: "Org A", clientCode: "test-svc-org-a" })
      .returning({ id: organization.id });
    const [orgB] = await db
      .insert(organization)
      .values({ name: "Org B", clientCode: "test-svc-org-b" })
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
      .values({ name: "Brand X", clientCode: "test-svc-brand-x" })
      .returning({ id: organization.id });
    const [franchise] = await db
      .insert(organization)
      .values({ name: "Franchise X1", clientCode: "test-svc-franchise-x1", parentOrganizationId: brand.id })
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
      .values({ name: "Org M", clientCode: "test-svc-org-m" })
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

describe("updateOrganization (integration)", () => {
  let createdOrgIds: string[] = [];
  afterEach(async () => {
    if (createdOrgIds.length) await db.delete(organization).where(inArray(organization.id, createdOrgIds));
    createdOrgIds = [];
  });

  it("updates name, clientCode, and region", async () => {
    const [org] = await db
      .insert(organization)
      .values({ name: "Old Name", clientCode: "test-svc-org-old" })
      .returning({ id: organization.id });
    createdOrgIds = [org.id];

    const result = await updateOrganization(org.id, {
      name: "New Name",
      clientCode: "test-svc-org-new",
      region: "ON", city: null, address: null, latitude: null, longitude: null,
    });

    expect(result.ok).toBe(true);
    const [row] = await db.select().from(organization).where(eq(organization.id, org.id)).limit(1);
    expect(row.name).toBe("New Name");
    expect(row.clientCode).toBe("test-svc-org-new");
    expect(row.region).toBe("ON");
  });

  it("rejects a duplicate clientCode as a correctable error", async () => {
    const [orgA] = await db
      .insert(organization)
      .values({ name: "Org A", clientCode: "test-svc-org-dup-a" })
      .returning({ id: organization.id });
    const [orgB] = await db
      .insert(organization)
      .values({ name: "Org B", clientCode: "test-svc-org-dup-b" })
      .returning({ id: organization.id });
    createdOrgIds = [orgA.id, orgB.id];

    const result = await updateOrganization(orgB.id, {
      name: "Org B",
      clientCode: "test-svc-org-dup-a",
      region: null, city: null, address: null, latitude: null, longitude: null,
    });

    expect(result.ok).toBe(false);
  });
});

describe("listMembershipsForUser (integration)", () => {
  afterEach(reset);

  it("returns every org this user is a member of", async () => {
    const [org] = await db
      .insert(organization)
      .values({ name: "Org N", clientCode: "test-svc-org-n" })
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

describe("searchUsersByEmail (integration)", () => {
  let createdUserIds: bigint[] = [];
  afterEach(async () => {
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
    createdUserIds = [];
    await reset();
  });

  it("returns users whose email contains the query, capped at 8", async () => {
    const token = Math.random().toString(36).slice(2);
    const matchOne = `match-${token}-one@test.invalid`;
    const matchTwo = `match-${token}-two@test.invalid`;
    const noMatch = `different-${token}@test.invalid`;
    const inserted = await db
      .insert(users)
      .values([
        { name: "Match One", email: matchOne, role: "admin" },
        { name: "Match Two", email: matchTwo, role: "admin" },
        { name: "No Match", email: noMatch, role: "admin" },
      ])
      .returning({ id: users.id });
    createdUserIds = inserted.map((r) => r.id);

    const result = await searchUsersByEmail(`match-${token}`);

    expect(result.map((r) => r.email).sort()).toEqual([matchOne, matchTwo].sort());
  });

  it("returns an empty array for a blank query rather than every user", async () => {
    const result = await searchUsersByEmail("");
    expect(result).toEqual([]);
  });
});

describe("updateMemberRole (integration)", () => {
  afterEach(reset);

  it("changes an existing member's role", async () => {
    const [org] = await db
      .insert(organization)
      .values({ name: "Org R", clientCode: "test-svc-org-role" })
      .returning({ id: organization.id });
    const [user] = await db
      .insert(users)
      .values({ name: "Roleable", email: `roleable-${Math.random().toString(36).slice(2)}@test.invalid`, role: "admin" })
      .returning({ id: users.id, publicId: users.publicId });
    await db.insert(member).values({ organizationId: org.id, userId: user.id, role: "admin" });

    await updateMemberRole(org.id, user.publicId, "owner");

    const rows = await listMembers(org.id);
    expect(rows[0].role).toBe("owner");
  });
});
