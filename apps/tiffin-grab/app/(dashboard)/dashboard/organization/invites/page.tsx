import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { getRoleChoices } from "@/lib/auth/role-options";
import { getMemberOrganizations, listOrganizations } from "@/lib/services/organizations.service";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { SectionCard } from "@/components/ds";
import { StatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { inviteBucket, inviteStats, type InviteBucket } from "../org-stats";
import { InviteUserButton } from "../members/invite-user-button";
import { InvitesList, InvitesListSkeleton } from "./invites-list";
import { getInvitationsForOrgs } from "./invites-query";
import { requestNow } from "@/lib/dates/request-now";

const BUCKETS: readonly InviteBucket[] = ["pending", "accepted", "expired", "canceled"];

type SearchParams = Promise<Record<string, string | undefined>>;

function InvitesCard({ children, roles = [] }: { children: React.ReactNode; roles?: { value: string; label: string }[] }) {
  return (
    <SectionCard
      title="Invitations"
      subtitle="Staff invited by email. Expired invites can be resent; pending ones canceled."
      action={roles.length ? <InviteUserButton roles={roles} /> : undefined}
    >
      {children}
    </SectionCard>
  );
}

export default function InvitesPage({ searchParams }: { searchParams: SearchParams }) {
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
      <InvitesData searchParams={searchParams} />
    </Suspense>
  );
}

async function InvitesData({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  const visible = await resolveSessionVisibleOrgIds(session);
  const orgIds = visible === "all" ? (await listOrganizations()).map((o) => o.id) : visible;

  const [rows, directOrgs, { options, canInvite }] = await Promise.all([
    getInvitationsForOrgs(orgIds),
    getMemberOrganizations(session),
    getRoleChoices(),
  ]);

  // better-auth's createInvitation/cancelInvitation require a direct `member`
  // row in the invitation's org, so actions are only offered there.
  const now = requestNow();
  const sp = await searchParams;
  const status = BUCKETS.find((b) => b === sp.status);
  const shown = status ? rows.filter((r) => inviteBucket(r, now) === status) : rows;
  return (
    <>
      <StatCards items={inviteStats(rows, now)} />
      <InvitesCard roles={canInvite ? options.filter((r) => !r.locked) : []}>
        <InvitesList rows={shown} status={status ?? "all"} actionableOrgIds={directOrgs.map((o) => o.id)} />
      </InvitesCard>
    </>
  );
}
