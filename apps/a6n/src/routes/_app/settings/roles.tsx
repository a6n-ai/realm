import { DeniedState, ErrorState } from "@foundry/console/error-state";
import { ListSkeleton } from "@foundry/console/list-skeleton";
import { RowMenu } from "@foundry/console/row-menu";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { SettingsCard } from "../../../components/page/settings-card";
import { RoleDialog, type RoleDialogMode } from "../../../components/roles/role-dialog";
import { roleLabel } from "../../../components/team/role-select";
import { errorText } from "../../../lib/error-copy";
import { deleteRoleFn, listRolesFn } from "../../../lib/roles/roles.fns";

export const Route = createFileRoute("/_app/settings/roles")({
  loader: () => listRolesFn(),
  pendingComponent: () => <ListSkeleton />,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return <ErrorState error={error} errorText={errorText} onRetry={() => void router.invalidate()} />;
  },
  component: RolesPage,
});

function RolesPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [dialog, setDialog] = useState<RoleDialogMode | null>(null);
  if (!data) return <DeniedState />;

  async function remove(name: string) {
    try {
      const res = await deleteRoleFn({ data: { name } });
      if (!res.ok) return void toast.error(errorText(new Error(res.code)));
      toast.success(`Role ${name} deleted`);
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <>
      <SettingsCard
        title="Roles"
        description="What each role can do in this organisation. Owner, Admin and Member are built in; create your own for anything else."
        footer="People get a role when they are invited, and an admin can change it on Members."
        action={data.canCreate ? <Button onClick={() => setDialog({ kind: "create" })}>Create role</Button> : undefined}
      >
        <ul className="grid divide-y">
          {data.roles.map((r) => (
            <li key={r.name} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="grid min-w-0 flex-1 gap-1">
                <span className="flex items-center gap-2 font-medium text-(--strong)">
                  {roleLabel(r.name)}
                  {r.builtIn ? <Badge variant="outline">Built-in</Badge> : null}
                </span>
                <span className="text-sm text-muted-foreground">
                  {r.permissions.length} permissions · {r.memberCount} {r.memberCount === 1 ? "member" : "members"}
                </span>
              </div>
              {r.builtIn ? null : (
                <RowMenu
                  label={`Actions for ${r.name}`}
                  actions={[
                    { label: "Edit role", hidden: !data.canUpdate, onSelect: () => setDialog({ kind: "edit", name: r.name, permissions: r.permissions }) },
                    { label: "Delete role", destructive: true, hidden: !data.canDelete, onSelect: () => void remove(r.name) },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      </SettingsCard>
      {dialog ? (
        <RoleDialog key={dialog.kind === "edit" ? dialog.name : "new"} mode={dialog} mine={data.mine} open onOpenChange={(o) => !o && setDialog(null)} />
      ) : null}
    </>
  );
}
