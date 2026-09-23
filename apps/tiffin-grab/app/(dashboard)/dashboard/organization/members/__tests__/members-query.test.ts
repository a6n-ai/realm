import { afterEach, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { db } from "@/db/client";
import { invitation, member, organization, users } from "@/db/schema";
import { getMembersForOrgs } from "../members-query";

const MARK = "members-query-test";

afterEach(async () => {
  // member/invitation rows cascade-delete with the organization (see
  // db/schema/organizations.ts onDelete: "cascade").
  await db.delete(organization).where(like(organization.clientCode, `%${MARK}%`));
  await db.delete(users).where(like(users.email, `%${MARK}%`));
});

describe("getMembersForOrgs", () => {
  it("scopes rows to the given org ids only", async () => {
    // Seed: two orgs, one member each, distinct emails.
    const [orgA] = await db.insert(organization).values({ name: "Org A", clientCode: "members-query-test-orga" }).returning();
    const [orgB] = await db.insert(organization).values({ name: "Org B", clientCode: "members-query-test-orgb" }).returning();
    const [userA] = await db
      .insert(users)
      .values({ email: "a-members-query-test@x.com", name: "A", role: "member", passwordSet: true })
      .returning();
    const [userB] = await db
      .insert(users)
      .values({ email: "b-members-query-test@x.com", name: "B", role: "member", passwordSet: true })
      .returning();
    await db.insert(member).values([
      { organizationId: orgA.id, userId: userA.id, role: "member" },
      { organizationId: orgB.id, userId: userB.id, role: "member" },
    ]);

    const rows = await getMembersForOrgs([orgA.id]);

    expect(rows.map((r) => r.email)).toEqual(["a-members-query-test@x.com"]);
  });

  it("marks a member with a pending invitation as invitationStatus 'pending'", async () => {
    const [org] = await db.insert(organization).values({ name: "Org C", clientCode: "members-query-test-orgc" }).returning();
    const [inviter] = await db
      .insert(users)
      .values({ email: "admin-members-query-test@x.com", name: "Admin", role: "admin", passwordSet: true })
      .returning();
    const [invitee] = await db
      .insert(users)
      .values({ email: "invitee-members-query-test@x.com", name: "Invitee", role: "member", passwordSet: false })
      .returning();
    await db.insert(member).values({ organizationId: org.id, userId: invitee.id, role: "member" });
    await db.insert(invitation).values({
      organizationId: org.id,
      email: "invitee-members-query-test@x.com",
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      inviterId: inviter.id,
    });

    const rows = await getMembersForOrgs([org.id]);

    expect(rows.find((r) => r.email === "invitee-members-query-test@x.com")?.invitationStatus).toBe("pending");
  });

  it("marks a member with an expired invitation as invitationStatus 'expired', not 'pending'", async () => {
    const [org] = await db.insert(organization).values({ name: "Org D", clientCode: "members-query-test-orgd" }).returning();
    const [inviter] = await db
      .insert(users)
      .values({ email: "admin2-members-query-test@x.com", name: "Admin", role: "admin", passwordSet: true })
      .returning();
    const [invitee] = await db
      .insert(users)
      .values({ email: "invitee2-members-query-test@x.com", name: "Invitee2", role: "member", passwordSet: false })
      .returning();
    await db.insert(member).values({ organizationId: org.id, userId: invitee.id, role: "member" });
    await db.insert(invitation).values({
      organizationId: org.id,
      email: "invitee2-members-query-test@x.com",
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() - 1000), // already past
      inviterId: inviter.id,
    });

    const rows = await getMembersForOrgs([org.id]);

    expect(rows.find((r) => r.email === "invitee2-members-query-test@x.com")?.invitationStatus).toBe("expired");
  });

  it("returns an empty list, not a throw, for an empty org-id array", async () => {
    const rows = await getMembersForOrgs([]);
    expect(rows).toEqual([]);
  });

  it("picks the newest invitation when a user has multiple invitations for the same org", async () => {
    const [org] = await db.insert(organization).values({ name: "Org E", clientCode: "members-query-test-orge" }).returning();
    const [inviter] = await db
      .insert(users)
      .values({ email: "admin3-members-query-test@x.com", name: "Admin", role: "admin", passwordSet: true })
      .returning();
    const [invitee] = await db
      .insert(users)
      .values({ email: "invitee3-members-query-test@x.com", name: "Invitee3", role: "member", passwordSet: false })
      .returning();
    await db.insert(member).values({ organizationId: org.id, userId: invitee.id, role: "member" });
    // Seed two invitations: older one (canceled), newer one (pending).
    // Use explicit createdAt times to ensure proper ordering.
    const now = Date.now();
    await db.insert(invitation).values([
      {
        organizationId: org.id,
        email: "invitee3-members-query-test@x.com",
        role: "member",
        status: "canceled",
        expiresAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
        inviterId: inviter.id,
        createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000), // oldest
      },
      {
        organizationId: org.id,
        email: "invitee3-members-query-test@x.com",
        role: "member",
        status: "pending",
        expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
        inviterId: inviter.id,
        createdAt: new Date(now - 1 * 60 * 1000), // newest
      },
    ]);

    const rows = await getMembersForOrgs([org.id]);

    expect(rows.find((r) => r.email === "invitee3-members-query-test@x.com")?.invitationStatus).toBe("pending");
  });
});
