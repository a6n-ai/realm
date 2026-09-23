import { Suspense } from "react";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { invitation, member, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/guards";
import { resolveMemberVisibleOrgIds, listOrganizations } from "@/lib/services/organizations.service";
import { getMembersForOrgs } from "../users/members-query";
import { StatCards } from "./stat-cards";
import { RecentActivity, type ActivityItem } from "./recent-activity";

export default function OrganizationOverviewPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={null}><OverviewData /></Suspense>
    </div>
  );
}

async function OverviewData() {
  await requireAdmin();
  const session = await getSession();
  const visible = await resolveMemberVisibleOrgIds(session);
  const allOrgs = await listOrganizations();
  const orgIds = visible === "all" ? allOrgs.map((o) => o.id) : visible;

  const [members, recentInvites, recentMembers] = await Promise.all([
    getMembersForOrgs(orgIds),
    orgIds.length === 0
      ? []
      : db
          .select({ email: invitation.email, createdAt: invitation.createdAt })
          .from(invitation)
          .where(inArray(invitation.organizationId, orgIds))
          .orderBy(desc(invitation.createdAt))
          .limit(10),
    orgIds.length === 0
      ? []
      : db
          .select({ name: users.name, email: users.email, createdAt: member.createdAt })
          .from(member)
          .innerJoin(users, eq(users.id, member.userId))
          .where(inArray(member.organizationId, orgIds))
          .orderBy(desc(member.createdAt))
          .limit(10),
  ]);

  const activity: ActivityItem[] = [
    ...recentInvites.map((r) => ({ kind: "invited" as const, email: r.email, at: r.createdAt.toISOString() })),
    ...recentMembers.map((r) => ({ kind: "joined" as const, name: r.name, email: r.email, at: r.createdAt.toISOString() })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 10);

  const franchiseCount = allOrgs.filter((o) => o.parentOrganizationId !== null && orgIds.includes(o.id)).length;
  const pendingInviteCount = members.filter((m) => m.invitationStatus === "pending").length;

  return (
    <>
      <StatCards franchiseCount={franchiseCount} staffCount={members.length} pendingInviteCount={pendingInviteCount} />
      <RecentActivity items={activity} />
    </>
  );
}
