"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, LockIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { OrgRoleDialog, type PermissionMap, type ResourceLabel } from "@foundry/crm";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { SaveBar, SwitchList, type SwitchRow } from "@/components/ds/switch-list";
import { Badge } from "@/components/reui/badge";
import { setMemberRoles } from "../members/actions";
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

export type RoleMember = { memberId: string; name: string | null; email: string | null; orgRole: string };

const heldBy = (orgRole: string) => orgRole.split(",").map((r) => r.trim()).filter(Boolean);

/** Holders of this role, and a picker to add more. Every change is one setMemberRoles call with the person's full role list. */
function RoleMembers({ roleName, members }: { roleName: string; members: RoleMember[] }) {
  const router = useRouter();
  const [candidate, setCandidate] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const holders = members.filter((m) => heldBy(m.orgRole).includes(roleName));
  const candidates = members.filter((m) => !heldBy(m.orgRole).includes(roleName));
  const label = (m: RoleMember) => m.name || m.email || "Unnamed";

  function change(m: RoleMember, roles: string[], done?: () => void) {
    setError(undefined);
    start(async () => {
      const res = await setMemberRoles(m.memberId, roles);
      if ("error" in res) return void setError(res.error);
      done?.();
      router.refresh();
    });
  }

  return (
    <section aria-label="Members with this role" className="grid gap-3">
      <h3 className="text-sm font-medium">Members with this role</h3>
      {holders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one has this role yet. Add someone below.</p>
      ) : (
        <ul className="grid gap-2">
          {holders.map((m) => (
            <li key={m.memberId} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{label(m)}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => change(m, heldBy(m.orgRole).filter((r) => r !== roleName))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {candidates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={candidate} onValueChange={setCandidate}>
            <SelectTrigger size="sm" className="min-w-56" aria-label="Person to add">
              <SelectValue placeholder="Choose a person" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((m) => (
                <SelectItem key={m.memberId} value={m.memberId}>{label(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={pending || !candidate}
            onClick={() => {
              const m = candidates.find((c) => c.memberId === candidate);
              if (m) change(m, [...heldBy(m.orgRole), roleName], () => setCandidate(""));
            }}
          >
            Add
          </Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

function DeleteRole({ role, id, disabled }: { role: RoleItem; id: string; disabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  function confirm() {
    setError(undefined);
    start(async () => {
      const res = await deleteRole(id);
      if ("error" in res) return void setError(res.error);
      toast.success("Role deleted.");
      setOpen(false);
      router.push(ROLES);
    });
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setError(undefined); }}>
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
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
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
  members,
}: {
  role: RoleItem;
  resources: ResourceLabel[];
  grantable: PermissionMap;
  canUpdate: boolean;
  canDelete: boolean;
  /** Null when the viewer may not see members (no member:update), so the member list is hidden. */
  members: RoleMember[] | null;
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

  // Renames through the shared role dialog. It saves the permissions it shows, so the draft seeds it.
  async function rename(input: { name: string; permission: PermissionMap }): Promise<{ error?: string }> {
    const res = await updateRole(role.id as string, { name: input.name, permission: input.permission });
    if ("error" in res) return { error: res.error };
    if (input.name !== role.name) router.replace(`${ROLES}?role=${encodeURIComponent(input.name)}`);
    router.refresh();
    return {};
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
          <>
            <OrgRoleDialog
              resources={resources}
              grantable={grantable}
              initial={{ name: role.name, permission: draft }}
              onSave={rename}
              trigger={<Button variant="outline" size="sm" disabled={!canUpdate}>Rename</Button>}
            />
            <DeleteRole role={role} id={role.id as string} disabled={!canDelete} />
          </>
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

      {members && <RoleMembers roleName={role.name} members={members} />}
    </div>
  );
}
