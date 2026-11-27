import { DeniedState, ErrorState } from "@foundry/console/error-state";
import { ListSkeleton } from "@foundry/console/list-skeleton";
import { PageHeader } from "@foundry/console/page-header";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { InviteDialog } from "../../components/team/invite-dialog";
import { TeamTable } from "../../components/team/team-table";
import { errorText } from "../../lib/error-copy";
import { listTeamFn } from "../../lib/team/team.fns";

export const Route = createFileRoute("/_app/team")({
  loader: () => listTeamFn(),
  pendingComponent: () => (
    <>
      <PageHeader crumbs={[{ label: "Team" }]} />
      <ListSkeleton />
    </>
  ),
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <>
        <PageHeader crumbs={[{ label: "Team" }]} />
        <ErrorState error={error} errorText={errorText} onRetry={() => void router.invalidate()} />
      </>
    );
  },
  component: TeamPage,
});

function TeamPage() {
  const team = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  if (!team) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Team" }]} />
        <DeniedState />
      </>
    );
  }
  return (
    <>
      <PageHeader crumbs={[{ label: "Team" }]} actions={<InviteDialog />} />
      <TeamTable members={team.members} statuses={team.statuses} selfId={shell.user.id} />
    </>
  );
}
