import { and, count, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { invitation, users } from "@/db/schema";
import type { InviteRow } from "./invites-list";

// Direct SQL, not auth.api.listInvitations: that endpoint requires the viewer
// to be a direct member of each org, which brand/super_admin viewers aren't.
export async function getInvitationsForOrgs(orgIds: string[]): Promise<InviteRow[]> {
  if (orgIds.length === 0) return [];
  const rows = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationId: invitation.organizationId,
      userId: users.publicId,
    })
    .from(invitation)
    .leftJoin(users, eq(users.email, invitation.email))
    .where(inArray(invitation.organizationId, orgIds))
    .orderBy(desc(invitation.createdAt));

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId ?? "",
    email: r.email,
    role: r.role ?? "member",
    status: r.status,
    expiresAt: r.expiresAt.toISOString(),
    organizationId: r.organizationId,
  }));
}

// Invitees have no `member` row until they accept, so pending invites must be
// counted from `invitation`, not derived from the members list.
export async function countPendingInvites(orgIds: string[]): Promise<number> {
  if (orgIds.length === 0) return 0;
  const [{ n }] = await db
    .select({ n: count() })
    .from(invitation)
    .where(
      and(
        inArray(invitation.organizationId, orgIds),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    );
  return n;
}
