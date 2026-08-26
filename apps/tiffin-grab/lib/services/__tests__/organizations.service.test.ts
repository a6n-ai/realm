import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ne } from "drizzle-orm";

const { db } = await import("@/db/client");
const { organization, member, users } = await import("@/db/schema");
const { getMemberOrganizations } = await import("../organizations.service");

async function reset() {
  await db.delete(member);
  await db.delete(organization).where(ne(organization.clientCode, "TG"));
  await db.delete(users).where(ne(users.isSystem, true));
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
