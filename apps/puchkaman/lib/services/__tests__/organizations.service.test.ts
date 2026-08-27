import { afterEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { member, organization, users } from "@/db/schema";
import { getMemberOrganizations, listOrganizations } from "../organizations.service";

// Scoped cleanup by tracked ids only — a blanket users wipe fails against
// FK-referencing tables in a shared dev DB (see this repo's own integration-
// test-isolation gotcha).
let createdUserIds: bigint[] = [];
let createdOrgIds: string[] = [];

async function reset() {
  await db.delete(member);
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
      .values({ name: "Org A", clientCode: "test-org-a" })
      .returning({ id: organization.id });
    const [orgB] = await db
      .insert(organization)
      .values({ name: "Org B", clientCode: "test-org-b" })
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
      .values({ name: "Brand X", clientCode: "test-brand-x" })
      .returning({ id: organization.id });
    const [franchise] = await db
      .insert(organization)
      .values({ name: "Franchise X1", clientCode: "test-franchise-x1", parentOrganizationId: brand.id })
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
