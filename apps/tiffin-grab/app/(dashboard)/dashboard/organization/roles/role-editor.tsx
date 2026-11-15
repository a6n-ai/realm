"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, LockIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import type { PermissionMap, ResourceLabel } from "@foundry/crm";
import { Button } from "@foundry/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@foundry/ui/dialog";
import { SaveBar, SwitchList, type SwitchRow } from "@/components/ds/switch-list";
import { Badge } from "@/components/reui/badge";
import { deleteRole, updateRole } from "./actions";
import { setPermission } from "./permission-toggle";
import {
  countOn,
  countPermissions,
  isGrantableAction,
  memberCount,
  samePermissions,
  totalPermissions,
  type RoleItem,
} from "./role-summary";

const ROLES = "/dashboard/organization/roles";

function DeleteRole({ role, id, disabled }: { role: RoleItem; id: string; disabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  function confirm() {
    start(async () => {
      const res = await deleteRole(id);
      if ("error" in res) return void toast.error(res.error);
      toast.success("Role deleted.");
      setOpen(false);
      router.push(ROLES);
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} aria-label={`Delete ${role.name}`}>
          <Trash2Icon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {role.name}?</DialogTitle>
          <DialogDescription>
            {role.members > 0
              ? `${memberCount(role.members)} still ${role.members === 1 ? "has" : "have"} this role. Move them to another role first.`
              : "This can't be undone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Keep</Button>
          </DialogClose>
          <Button variant="destructive" disabled={pending || role.members > 0} onClick={confirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Draft of the whole permission set. Save sends it in one updateRole call; built-in roles are read-only. */
export function RoleEditor({
  role,
  resources,
  grantable,
  canUpdate,
  canDelete,
}: {
  role: RoleItem;
  resources: ResourceLabel[];
  grantable: PermissionMap;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<PermissionMap>(role.permission);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const readOnly = role.id === null;
  const dirty = !samePermissions(draft, role.permission);

  function save() {
    if (!role.id) return;
    setError(undefined);
    start(async () => {
      const res = await updateRole(role.id as string, { permission: draft });
      if ("error" in res) return void setError(res.error);
      toast.success("Role saved.");
      router.refresh();
    });
  }

  const rowsFor = (r: ResourceLabel): SwitchRow[] =>
    r.actions.map((a) => {
      const allowed = isGrantableAction(grantable, r.resource, a.action);
      return {
        id: `${r.resource}.${a.action}`,
        label: a.label,
        hint: !readOnly && !allowed ? "You don't have this permission" : undefined,
        checked: draft[r.resource]?.includes(a.action) ?? false,
        disabled: readOnly || !canUpdate || pending || !allowed,
        onChange: (on: boolean) => setDraft((d) => setPermission(d, r.resource, a.action, on)),
      };
    });

  return (
    <div className="grid content-start gap-6">
      <Link href={ROLES} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> All roles
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold capitalize">{role.name}</h2>
        {readOnly ? (
          <Badge variant="secondary">
            <LockIcon /> Built-in
          </Badge>
        ) : (
          <DeleteRole role={role} id={role.id as string} disabled={!canDelete} />
        )}
        <span className="text-xs text-muted-foreground">{memberCount(role.members)}</span>
      </div>

      {readOnly ? (
        <p className="text-sm text-muted-foreground">Built-in roles are fixed. Create a custom role for anything in between.</p>
      ) : (
        <SaveBar
          status={`${countPermissions(draft)} of ${totalPermissions(resources)} permissions${dirty ? " · unsaved changes" : ""}`}
          dirty={dirty && canUpdate}
          pending={pending}
          error={error}
          onReset={() => setDraft(role.permission)}
          onSave={save}
        />
      )}

      <div className="grid items-start gap-6 md:grid-cols-2">
        {resources.map((r) => (
          <section key={r.resource} className="grid gap-2" aria-label={r.label}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">{r.label}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {countOn(draft, r)} of {r.actions.length} on
              </span>
            </div>
            <SwitchList rows={rowsFor(r)} />
          </section>
        ))}
      </div>
    </div>
  );
}
