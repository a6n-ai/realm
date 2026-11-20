import { SectionCard } from "@/components/ds";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { InvitesListSkeleton } from "../invites/invites-list";
import { UsersListSkeleton } from "../members/users-list";

export default function Loading() {
  return (
    <>
      <StatCardsSkeleton count={5} />
      <SectionCard title="People">
        <UsersListSkeleton />
      </SectionCard>
      <SectionCard title="Invitations">
        <InvitesListSkeleton />
      </SectionCard>
    </>
  );
}
