import { DeniedState, ErrorState } from "@foundry/console/error-state";
import { RowMenu } from "@foundry/console/row-menu";
import { Button } from "@foundry/ui/button";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { SettingsCard } from "../../../components/page/settings-card";
import { TeamMembersDialog, TeamNameDialog } from "../../../components/teams/team-dialogs";
import { errorText } from "../../../lib/error-copy";
import type { TeamRow } from "../../../lib/teams/service";
import { deleteTeamFn, listTeamsFn } from "../../../lib/teams/teams.fns";
import { TeamsSkeleton } from "../../../components/page/skeletons";


export const Route = createFileRoute("/_app/settings/teams")({
  loader: () => listTeamsFn(),
  pendingComponent: TeamsSkeleton,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return <ErrorState error={error} errorText={errorText} onRetry={() => void router.invalidate()} />;
  },
  component: TeamsPage,
});

function TeamsPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [naming, setNaming] = useState<TeamRow | "new" | null>(null);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  if (!data) return <DeniedState />;

  async function remove(t: TeamRow) {
    try {
      const res = await deleteTeamFn({ data: { id: t.id } });
      if (!res.ok) return void toast.error(errorText(new Error(res.code)));
      toast.success(`Team ${t.name} deleted`);
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <>
      <SettingsCard
        title="Teams"
        description="Group people in this organisation. Someone can be in several teams."
        footer={data.teams.length === 0 ? "No teams yet." : `${data.teams.length} ${data.teams.length === 1 ? "team" : "teams"}`}
        action={data.canCreate ? <Button onClick={() => setNaming("new")}>Create team</Button> : undefined}
      >
        {data.teams.length === 0 ? null : (
          <ul className="grid divide-y">
            {data.teams.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="grid min-w-0 flex-1 gap-1">
                  <span className="font-medium text-(--strong)">{t.name}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {t.members.length === 0 ? "No members" : t.members.map((m) => m.name).join(", ")}
                  </span>
                </div>
                <RowMenu
                  label={`Actions for ${t.name}`}
                  actions={[
                    { label: "Manage members", onSelect: () => setEditing(t) },
                    { label: "Rename team", onSelect: () => setNaming(t) },
                    { label: "Delete team", destructive: true, hidden: !data.canDelete, onSelect: () => void remove(t) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
      {naming ? <TeamNameDialog key={naming === "new" ? "new" : naming.id} team={naming === "new" ? null : naming} onClose={() => setNaming(null)} /> : null}
      {editing ? <TeamMembersDialog team={editing} people={data.people} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
