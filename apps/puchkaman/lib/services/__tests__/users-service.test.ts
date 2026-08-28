import { afterEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
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
