import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { invitation, member, users } from "@/db/schema";
import type { RoleValue } from "@foundry/commons";

export type MemberRow = {
  id: string; // users.publicId
  name: string | null;
  email: string | null;
  phone: string | null;
  role: RoleValue;
  status: "active" | "inactive" | "suspended" | "deleted";
  passwordSet: boolean;
  invitationStatus: "none" | "pending" | "expired" | "accepted";
};

/**
 * Org-scoped member list. Replaces the prior global `users` query — every row
 * returned here has a `member` row in one of `orgIds`. Empty `orgIds` returns
 * an empty list, never an unscoped query (guards the "brand admin with zero
 * franchises yet" and "orgIds resolved to []" cases the same way).
 */
export async function getMembersForOrgs(orgIds: string[]): Promise<MemberRow[]> {
  if (orgIds.length === 0) return [];

  const rows = await db
    .selectDistinctOn([users.id], {
      id: users.publicId,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      status: users.status,
      passwordSet: users.passwordSet,
      invitationStatus: invitation.status,
      invitationExpiresAt: invitation.expiresAt,
    })
    .from(member)
    .innerJoin(users, eq(users.id, member.userId))
    .leftJoin(
      invitation,
      and(eq(invitation.email, users.email), eq(invitation.organizationId, member.organizationId)),
    )
    .where(inArray(member.organizationId, orgIds))
    .orderBy(users.id, invitation.createdAt);

  const now = Date.now();
  return rows.map((r) => {
    let invitationStatus: MemberRow["invitationStatus"] = "none";
    if (r.invitationStatus === "pending") {
      invitationStatus = r.invitationExpiresAt && r.invitationExpiresAt.getTime() < now ? "expired" : "pending";
    } else if (r.invitationStatus === "accepted") {
      invitationStatus = "accepted";
    }
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      role: r.role as RoleValue,
      status: r.status,
      passwordSet: r.passwordSet,
      invitationStatus,
    };
  });
}
