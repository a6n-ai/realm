import { DeniedState, ErrorState } from "@foundry/console/error-state";
import { useConsoleRouter } from "@foundry/console/router";
import { SearchInput, Toolbar } from "@foundry/console/toolbar";
import { useUrlFilter } from "@foundry/console/use-url-filter";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { FilterBar } from "../../../components/page/filter-bar";
import { filterMembers, memberFacets, STATUS_FACET } from "../../../components/team/members";
import { InviteForm } from "../../../components/team/invite-dialog";
import { TeamTable } from "../../../components/team/team-table";
import { errorText } from "../../../lib/error-copy";
import { listTeamFn } from "../../../lib/team/team.fns";
import { MembersSkeleton } from "../../../components/page/skeletons";


const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/_app/settings/members")({
  validateSearch: (s: Record<string, unknown>): { q?: string; role?: string; status?: string } => ({
    q: str(typeof s.q === "number" ? String(s.q) : s.q),
    role: str(s.role)?.slice(0, 64),
    status: STATUS_FACET.options.find((o) => o.value === s.status)?.value,
  }),
  loader: () => listTeamFn(),
  pendingComponent: MembersSkeleton,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return <ErrorState error={error} errorText={errorText} onRetry={() => void router.invalidate()} />;
  },
  component: MembersPage,
});

function InviteCard({ roles }: { roles: { name: string; builtIn: boolean }[] }) {
  const [round, setRound] = useState(0);
  return <InviteForm key={round} inline roles={roles} done={() => setRound(round + 1)} />;
}

function MembersPage() {
  const team = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useConsoleRouter().useNavigate();
  const [q, setQ] = useUrlFilter("q");
  if (!team) return <DeniedState />;
  const shown = filterMembers(team.members, search);
  return (
    <>
      <InviteCard roles={team.roles} />
      <section aria-label="Members" className="grid [&>div:first-child]:px-0 [&_[data-slot=card-content]]:mx-0 [&_[data-slot=card-content]]:mb-0">
        <Toolbar
          search={<SearchInput value={q} onChange={setQ} placeholder="Search name or email" />}
          filters={<FilterBar facets={memberFacets(team.roles.map((r) => r.name))} value={search} onChange={(next) => navigate({ search: next, replace: true })} />}
        />
        <TeamTable members={shown} statuses={team.statuses} selfId={shell.user.id} roles={team.roles} canChangeRoles={team.canChangeRoles} canRemove={team.canRemove} canSetManager={team.canSetManager} everyone={team.members} filtered={Boolean(search.q || search.role || search.status)} />
      </section>
    </>
  );
}
