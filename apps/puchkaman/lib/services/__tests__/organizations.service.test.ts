import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { member, organization, users } from "@/db/schema";
import {
  addMember,
  getMemberOrganizations,
  listMembers,
  listOrganizations,
  removeMember,
  searchUsersByEmail,
  updateMemberRole,
  updateOrganization,
} from "../organizations.service";

// Scoped cleanup by tracked ids only — a blanket users wipe fails against
// FK-referencing tables in a shared dev DB (see this repo's own integration-
// test-isolation gotcha).
let createdUserIds: bigint[] = [];
let createdOrgIds: string[] = [];

// clientCode is unique-indexed; suffix every fixture literal so a row left
// behind by a crashed prior run can never collide with a fresh insert.
const runId = Math.random().toString(36).slice(2);

async function reset() {
  // member.organizationId FK is ON DELETE CASCADE, so deleting the tracked
  // orgs already clears their member rows — no blanket member delete needed.
  if (createdOrgIds.length) await db.delete(organization).where(inArray(organization.id, createdOrgIds));
  if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  createdUserIds = [];
  createdOrgIds = [];
}

describe("getMemberOrganizations (integration)", () => {
  afterEach(reset);

  it("returns every org the user has a member row in", async () => {
    const [orgA] = await db
      .insert(organization)
      .values({ name: "Org A", clientCode: `test-org-a-${runId}` })
      .returning({ id: organization.id });
    const [orgB] = await db
      .insert(organization)
      .values({ name: "Org B", clientCode: `test-org-b-${runId}` })
      .returning({ id: organization.id });
    createdOrgIds = [orgA.id, orgB.id];
    const [user] = await db
      .insert(users)
      .values({ name: "Multi Org", email: `multi-${Math.random().toString(36).slice(2)}@test.invalid`, role: "admin" })
      .returning({ id: users.id, publicId: users.publicId });
    createdUserIds = [user.id];
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
      .returning({ id: users.id, publicId: users.publicId });
    createdUserIds = [user.id];

    const result = await getMemberOrganizations({ user: { id: user.publicId } });

    expect(result).toEqual([]);
  });

  it("returns an empty list for a null session", async () => {
    const result = await getMemberOrganizations(null);
    expect(result).toEqual([]);
  });
});

describe("listOrganizations (integration)", () => {
  afterEach(reset);

  it("returns every org with its member count", async () => {
    const [brand] = await db
      .insert(organization)
      .values({ name: "Brand X", clientCode: `test-brand-x-${runId}` })
      .returning({ id: organization.id });
    const [franchise] = await db
      .insert(organization)
      .values({ name: "Franchise X1", clientCode: `test-franchise-x1-${runId}`, parentOrganizationId: brand.id })
      .returning({ id: organization.id });
    createdOrgIds = [brand.id, franchise.id];
    const [user] = await db
      .insert(users)
      .values({ name: "Member", email: `member-${Math.random().toString(36).slice(2)}@test.invalid`, role: "admin" })
      .returning({ id: users.id });
    createdUserIds = [user.id];
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
      .values({ name: "Org M", clientCode: `test-org-m-${runId}` })
      .returning({ id: organization.id });
    createdOrgIds = [org.id];
    const [user] = await db
      .insert(users)
      .values({ name: "Addable", email: `addable-${Math.random().toString(36).slice(2)}@test.invalid`, role: "admin" })
      .returning({ id: users.id, publicId: users.publicId });
    createdUserIds = [user.id];

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
  afterEach(reset);

  it("updates name, clientCode, and region", async () => {
    const [org] = await db
      .insert(organization)
      .values({ name: "Old Name", clientCode: `test-org-old-${runId}` })
      .returning({ id: organization.id });
    createdOrgIds = [org.id];

    const result = await updateOrganization(org.id, {
      name: "New Name",
      clientCode: `test-org-new-${runId}`,
      region: "ON", city: null, address: null, storeLat: null, storeLng: null,
    });

    expect(result.ok).toBe(true);
    const [row] = await db.select().from(organization).where(eq(organization.id, org.id)).limit(1);
    expect(row.name).toBe("New Name");
    expect(row.clientCode).toBe(`test-org-new-${runId}`);
    expect(row.region).toBe("ON");
  });

  it("rejects a duplicate clientCode as a correctable error", async () => {
    const [orgA] = await db
      .insert(organization)
      .values({ name: "Org A", clientCode: `test-org-dup-a-${runId}` })
      .returning({ id: organization.id });
    const [orgB] = await db
      .insert(organization)
      .values({ name: "Org B", clientCode: `test-org-dup-b-${runId}` })
      .returning({ id: organization.id });
    createdOrgIds = [orgA.id, orgB.id];

    const result = await updateOrganization(orgB.id, {
      name: "Org B",
      clientCode: `test-org-dup-a-${runId}`,
      region: null, city: null, address: null, storeLat: null, storeLng: null,
    });

    expect(result.ok).toBe(false);
  });
});

describe("searchUsersByEmail (integration)", () => {
  afterEach(reset);

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
      .values({ name: "Org R", clientCode: `test-org-role-${runId}` })
      .returning({ id: organization.id });
    createdOrgIds = [org.id];
    const [user] = await db
      .insert(users)
      .values({ name: "Roleable", email: `roleable-${Math.random().toString(36).slice(2)}@test.invalid`, role: "admin" })
      .returning({ id: users.id, publicId: users.publicId });
    createdUserIds = [user.id];
    await db.insert(member).values({ organizationId: org.id, userId: user.id, role: "admin" });

    await updateMemberRole(org.id, user.publicId, "owner");

    const rows = await listMembers(org.id);
    expect(rows[0].role).toBe("owner");
  });
});
