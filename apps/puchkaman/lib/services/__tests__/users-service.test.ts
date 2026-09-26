import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { member, organization, users } from "@/db/schema";
import { usersService, tombstoneEmail } from "../users.service";

describe("tombstoneEmail", () => {
  it("uses the reserved .invalid TLD so nothing can ever route mail to it", () => {
    expect(tombstoneEmail("usr_abc123")).toBe("deleted-usr_abc123@deleted.invalid");
  });

  it("is unique per user, so two deletions cannot collide on the unique index", () => {
    expect(tombstoneEmail("usr_a")).not.toBe(tombstoneEmail("usr_b"));
  });
});

describe("queryUsers org membership (integration)", () => {
  let createdUserIds: bigint[] = [];
  let createdOrgIds: string[] = [];
  const runId = Math.random().toString(36).slice(2);

  afterEach(async () => {
    if (createdOrgIds.length) await db.delete(organization).where(inArray(organization.id, createdOrgIds));
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
    createdUserIds = [];
    createdOrgIds = [];
  });

  async function seedUser(name: string) {
    const [user] = await db
      .insert(users)
      .values({ name, email: `${name.toLowerCase()}-${runId}@test.invalid`, role: "admin" })
      .returning({ id: users.id, publicId: users.publicId });
    createdUserIds.push(user.id);
    return user;
  }

  it("shows a single org name for a user in one org", async () => {
    const [org] = await db
      .insert(organization)
      .values({ name: "Org Solo", clientCode: `test-solo-${runId}` })
      .returning({ id: organization.id });
    createdOrgIds.push(org.id);
    const user = await seedUser("Solo");
    await db.insert(member).values({ organizationId: org.id, userId: user.id, role: "admin" });

    const result = await usersService.queryUsers(undefined, { page: 0, size: 50 });
    const row = result.items.find((r) => r.publicId === user.publicId);

    expect(row?.orgNames).toBe("Org Solo");
  });

  it("shows null for a user with no org membership", async () => {
    const user = await seedUser("Orgless");

    const result = await usersService.queryUsers(undefined, { page: 0, size: 50 });
    const row = result.items.find((r) => r.publicId === user.publicId);

    expect(row?.orgNames).toBeNull();
  });

  it("comma-joins every org for a user in multiple orgs", async () => {
    const [orgA] = await db
      .insert(organization)
      .values({ name: "Org A", clientCode: `test-multi-a-${runId}` })
      .returning({ id: organization.id });
    const [orgB] = await db
      .insert(organization)
      .values({ name: "Org B", clientCode: `test-multi-b-${runId}` })
      .returning({ id: organization.id });
    createdOrgIds.push(orgA.id, orgB.id);
    const user = await seedUser("Multi");
    await db
      .insert(member)
      .values([
        { organizationId: orgA.id, userId: user.id, role: "admin" },
        { organizationId: orgB.id, userId: user.id, role: "admin" },
      ]);

    const result = await usersService.queryUsers(undefined, { page: 0, size: 50 });
    const row = result.items.find((r) => r.publicId === user.publicId);

    expect(row?.orgNames?.split(", ").sort()).toEqual(["Org A", "Org B"]);
  });
});

describe("setRole brand membership (integration)", () => {
  const runId = Math.random().toString(36).slice(2);
  let createdUserIds: bigint[] = [];
  let createdOrgIds: string[] = [];

  afterEach(async () => {
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
    if (createdOrgIds.length) await db.delete(organization).where(inArray(organization.id, createdOrgIds));
    createdUserIds = [];
    createdOrgIds = [];
  });

  async function brandId(): Promise<string> {
    const [existing] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(isNull(organization.parentOrganizationId))
      .orderBy(organization.createdAt)
      .limit(1);
    if (existing) return existing.id;
    const [o] = await db.insert(organization).values({ name: "Brand", clientCode: `brand-${runId}` }).returning();
    createdOrgIds.push(o.id);
    return o.id;
  }

  async function seed(role: "user" | "member") {
    const [u] = await db
      .insert(users)
      .values({ email: `role-${role}-${Math.random().toString(36).slice(2)}@test.invalid`, role })
      .returning({ id: users.id, publicId: users.publicId });
    createdUserIds.push(u.id);
    return u;
  }

  const orgsOf = (id: bigint) =>
    db.select({ org: member.organizationId, role: member.role }).from(member).where(eq(member.userId, id));

  it("adds a newly promoted user to the brand org", async () => {
    const brand = await brandId();
    const u = await seed("user");
    await usersService.setRole(u.publicId, "member");
    expect(await orgsOf(u.id)).toEqual([{ org: brand, role: "member" }]);
  });

  it("leaves an existing franchise membership alone", async () => {
    await brandId();
    const [fr] = await db.insert(organization).values({ name: "Fr", clientCode: `fr-${runId}` }).returning();
    createdOrgIds.push(fr.id);
    const u = await seed("member");
    await db.insert(member).values({ organizationId: fr.id, userId: u.id, role: "member" });
    await usersService.setRole(u.publicId, "admin");
    expect(await orgsOf(u.id)).toEqual([{ org: fr.id, role: "member" }]);
  });
});
