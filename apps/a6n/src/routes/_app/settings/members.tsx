import { DeniedState, ErrorState } from "@foundry/console/error-state";
import { ListSkeleton } from "@foundry/console/list-skeleton";
import { useConsoleRouter } from "@foundry/console/router";
import { SearchInput, Toolbar } from "@foundry/console/toolbar";
import { useUrlFilter } from "@foundry/console/use-url-filter";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { FilterBar } from "../../../components/page/filter-bar";
import { filterMembers, MEMBER_FACETS } from "../../../components/team/members";
import { InviteForm } from "../../../components/team/invite-dialog";
import { TeamTable } from "../../../components/team/team-table";
import { errorText } from "../../../lib/error-copy";
import { listTeamFn } from "../../../lib/team/team.fns";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/_app/settings/members")({
  validateSearch: (s: Record<string, unknown>): { q?: string; role?: string; status?: string } => ({
    q: str(typeof s.q === "number" ? String(s.q) : s.q),
    role: MEMBER_FACETS[0]!.options.find((o) => o.value === s.role)?.value,
    status: MEMBER_FACETS[1]!.options.find((o) => o.value === s.status)?.value,
  }),
  loader: () => listTeamFn(),
  pendingComponent: () => <ListSkeleton />,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return <ErrorState error={error} errorText={errorText} onRetry={() => void router.invalidate()} />;
  },
  component: MembersPage,
});

function InviteCard() {
  const [round, setRound] = useState(0);
  return <InviteForm key={round} inline done={() => setRound(round + 1)} />;
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
      <InviteCard />
      <section aria-label="Members" className="grid [&>div:first-child]:px-0 [&_[data-slot=card-content]]:mx-0 [&_[data-slot=card-content]]:mb-0">
        <Toolbar
          search={<SearchInput value={q} onChange={setQ} placeholder="Search name or email" />}
          filters={<FilterBar facets={MEMBER_FACETS} value={search} onChange={(next) => navigate({ search: next, replace: true })} />}
        />
        <TeamTable members={shown} statuses={team.statuses} selfId={shell.user.id} filtered={Boolean(search.q || search.role || search.status)} />
      </section>
    </>
  );
}
