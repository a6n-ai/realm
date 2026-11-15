import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { inArray, like } from "drizzle-orm";

const { db } = await import("@/db/client");
const { organization, member, users } = await import("@/db/schema");
const { resolveSessionVisibleOrgIds } = await import("../visible-orgs");

async function reset() {
  const orgs = await db.select({ id: organization.id }).from(organization).where(like(organization.clientCode, "test-vis-%"));
  const ids = orgs.map((o) => o.id);
  if (ids.length) await db.delete(member).where(inArray(member.organizationId, ids));
  await db.delete(organization).where(like(organization.clientCode, "test-vis-%"));
  await db.delete(users).where(like(users.email, "vis-%@test.invalid"));
}

async function fixture() {
  const sfx = Math.random().toString(36).slice(2);
  const [brand] = await db.insert(organization).values({ name: "Brand", clientCode: `test-vis-b-${sfx}` }).returning({ id: organization.id });
  const [franchise] = await db.insert(organization).values({ name: "Franchise", clientCode: `test-vis-f-${sfx}` }).returning({ id: organization.id });
  const [user] = await db
    .insert(users)
    .values({ name: "Staff", email: `vis-${sfx}@test.invalid`, role: "member" })
    .returning({ id: users.id, publicId: users.publicId });
  await db.insert(member).values([
    { organizationId: brand.id, userId: user.id, role: "member" },
    { organizationId: franchise.id, userId: user.id, role: "member" },
  ]);
  return { brand, franchise, user };
}

describe("resolveSessionVisibleOrgIds", () => {
  beforeEach(reset);
  afterAll(reset);

  it("narrows a multi-org member to the active org", async () => {
    const { franchise, user } = await fixture();
    const visible = await resolveSessionVisibleOrgIds({
      user: { id: user.publicId, platformRole: null },
      session: { activeOrganizationId: franchise.id },
    });
    expect(visible).toEqual([franchise.id]);
  });

  it("returns [] when the active org has no member row", async () => {
    const { user } = await fixture();
    const [other] = await db.insert(organization).values({ name: "Other", clientCode: `test-vis-o-${Math.random().toString(36).slice(2)}` }).returning({ id: organization.id });
    const visible = await resolveSessionVisibleOrgIds({
      user: { id: user.publicId, platformRole: null },
      session: { activeOrganizationId: other.id },
    });
    expect(visible).toEqual([]);
  });

  it("returns [] with no active org", async () => {
    const { user } = await fixture();
    expect(await resolveSessionVisibleOrgIds({ user: { id: user.publicId }, session: { activeOrganizationId: null } })).toEqual([]);
  });

  it("returns all for super_admin, even with no member rows", async () => {
    const visible = await resolveSessionVisibleOrgIds({ user: { id: "usr_none", platformRole: "super_admin" } });
    expect(visible).toBe("all");
  });
});
