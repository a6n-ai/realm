import { afterEach, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { db } from "@/db/client";
import { invitation, organization, users } from "@/db/schema";
import { getMembersForOrgs } from "../../members/members-query";
import { countPendingInvites, getInvitationsForOrgs } from "../invites-query";

const MARK = "invites-query-test";
const DAY = 24 * 60 * 60 * 1000;

afterEach(async () => {
  await db.delete(organization).where(like(organization.clientCode, `%${MARK}%`));
  await db.delete(users).where(like(users.email, `%${MARK}%`));
});

async function seedFranchiseWithInvites() {
  const [org] = await db.insert(organization).values({ name: "Franchise", clientCode: `${MARK}-fr` }).returning();
  const [inviter] = await db
    .insert(users)
    .values({ email: `admin-${MARK}@x.com`, name: "Admin", role: "admin", passwordSet: true })
    .returning();
  // Invitee has a credential-less users row and no member row, as inviteUser leaves it.
  const [invitee] = await db
    .insert(users)
    .values({ email: `invitee-${MARK}@x.com`, name: "Invitee", role: "member", passwordSet: false })
    .returning();
  await db.insert(invitation).values([
    { organizationId: org.id, email: invitee.email!, role: "member", status: "pending", expiresAt: new Date(Date.now() + 7 * DAY), inviterId: inviter.id },
    { organizationId: org.id, email: `stale-${MARK}@x.com`, role: "member", status: "pending", expiresAt: new Date(Date.now() - 1000), inviterId: inviter.id },
    { organizationId: org.id, email: `gone-${MARK}@x.com`, role: "member", status: "canceled", expiresAt: new Date(Date.now() + DAY), inviterId: inviter.id },
  ]);
  return { org, invitee };
}

describe("countPendingInvites", () => {
  it("counts a pending invite for a franchise with zero members (old members-derived count showed 0)", async () => {
    const { org } = await seedFranchiseWithInvites();

    expect(await getMembersForOrgs([org.id])).toEqual([]);
    expect(await countPendingInvites([org.id])).toBe(1);
  });

  it("returns 0 for an empty org list", async () => {
    expect(await countPendingInvites([])).toBe(0);
  });
});

describe("getInvitationsForOrgs", () => {
  it("returns every invitation for the orgs, resolving userId by email when a users row exists", async () => {
    const { org, invitee } = await seedFranchiseWithInvites();

    const rows = await getInvitationsForOrgs([org.id]);

    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.email === invitee.email)?.userId).toBe(invitee.publicId);
    expect(rows.find((r) => r.email === `stale-${MARK}@x.com`)?.userId).toBe("");
  });
});
