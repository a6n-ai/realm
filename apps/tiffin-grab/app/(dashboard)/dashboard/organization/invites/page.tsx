import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/guards";
import { INVITABLE_ROLES } from "@/lib/auth/permissions";
import { getMemberOrganizations, resolveMemberVisibleOrgIds, listOrganizations } from "@/lib/services/organizations.service";
import { SectionCard } from "@/components/ds";
import { StatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { inviteStats } from "../org-stats";
import { InviteUserButton } from "../members/invite-user-button";
import { InvitesList, InvitesListSkeleton } from "./invites-list";
import { getInvitationsForOrgs } from "./invites-query";

const ROLES = INVITABLE_ROLES.map((r) => ({ value: r, label: r }));

function InvitesCard({ children }: { children: React.ReactNode }) {
  return (
    <SectionCard
      title="Invitations"
      subtitle="Staff invited by email. Expired invites can be resent; pending ones canceled."
      action={<InviteUserButton roles={ROLES} />}
    >
      {children}
    </SectionCard>
  );
}

export default function InvitesPage() {
  return (
    <Suspense
      fallback={
        <>
          <StatCardsSkeleton count={5} />
          <InvitesCard>
            <InvitesListSkeleton />
          </InvitesCard>
        </>
      }
    >
      <InvitesData />
    </Suspense>
  );
}

async function InvitesData() {
  await requireAdmin();
  const session = await getSession();
  const visible = await resolveMemberVisibleOrgIds(session);
  const orgIds = visible === "all" ? (await listOrganizations()).map((o) => o.id) : visible;

  const [rows, directOrgs] = await Promise.all([getInvitationsForOrgs(orgIds), getMemberOrganizations(session)]);

  // better-auth's createInvitation/cancelInvitation require a direct `member`
  // row in the invitation's org, so actions are only offered there.
  // eslint-disable-next-line react-hooks/purity -- server component: "expired" is relative to the request clock
  const now = Date.now();
  return (
    <>
      <StatCards items={inviteStats(rows, now)} />
      <InvitesCard>
        <InvitesList rows={rows} actionableOrgIds={directOrgs.map((o) => o.id)} />
      </InvitesCard>
    </>
  );
}
