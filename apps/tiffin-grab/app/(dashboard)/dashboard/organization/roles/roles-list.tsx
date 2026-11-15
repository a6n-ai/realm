"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockIcon, PencilIcon, PlusIcon, ShieldCheckIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { OrgRoleDialog, RoleChips, RoleMasterDetail, type PermissionMap, type ResourceLabel } from "@foundry/crm";
import { cn } from "@foundry/ui/cn";
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
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Skeleton } from "@foundry/ui/skeleton";
import { Switch } from "@foundry/ui/switch";
import { EmptyState } from "@/components/ds";
import { Badge } from "@/components/reui/badge";
import { chipReasons, type RoleChoice } from "../access/role-chip-reasons";
import { setMemberRoles } from "../members/actions";
import { createRole, deleteRole, updateRole } from "./actions";
import { setPermission } from "./permission-toggle";

const ROLES = "/dashboard/organization/roles";
const memberCount = (n: number) => `${n} ${n === 1 ? "member" : "members"}`;

export type RoleItem = { name: string; id: string | null; permission: PermissionMap; members: number };
export type Person = { id: string; name: string; email: string | null; roles: string[] };

type Props = {
  resources: ResourceLabel[];
  grantable: PermissionMap;
  roles: RoleItem[];
  selected: string | null;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** Null when the viewer cannot read members, so the holders section is hidden. */
  people: Person[] | null;
  roleOptions: RoleChoice[];
  selfEmail: string | null;
};

function RoleLink({ role, active }: { role: RoleItem; active: boolean }) {
  return (
    <li>
      <Link
        href={`${ROLES}?role=${encodeURIComponent(role.name)}`}
        aria-current={active || undefined}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted",
          active && "bg-muted",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium capitalize">{role.name}</span>
        {role.id === null && <LockIcon aria-hidden className="size-4 text-muted-foreground" />}
        <span className="text-xs text-muted-foreground">{memberCount(role.members)}</span>
      </Link>
    </li>
  );
}

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

function AddHolder({ candidates, role }: { candidates: Person[]; role: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  function add(id: string) {
    const person = candidates.find((c) => c.id === id);
    if (!person) return;
    setError(undefined);
    start(async () => {
      const res = await setMemberRoles(id, [...person.roles, role]);
      if ("error" in res) return void setError(res.error);
      router.refresh();
    });
  }
  return (
    <div className="grid gap-2">
      <Select value="" onValueChange={add} disabled={pending}>
        <SelectTrigger aria-label={`Add a member to ${role}`}>
          <SelectValue placeholder="Add a member" />
        </SelectTrigger>
        <SelectContent>
          {candidates.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function RoleDetail({
  role,
  resources,
  grantable,
  canUpdate,
  canDelete,
  people,
  roleOptions,
  selfEmail,
}: Omit<Props, "roles" | "selected" | "canCreate"> & { role: RoleItem }) {
  const router = useRouter();
  const [perm, setPerm] = useState<PermissionMap>(role.permission);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const readOnly = role.id === null;
  const reason = people ? chipReasons(people, roleOptions, selfEmail) : null;

  function toggle(resource: string, action: string, on: boolean) {
    if (role.id === null) return;
    const prev = perm;
    const next = setPermission(perm, resource, action, on);
    setPerm(next);
    setError(undefined);
    start(async () => {
      const res = await updateRole(role.id as string, { permission: next });
      if ("error" in res) {
        setPerm(prev);
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const holders = people?.filter((p) => p.roles.includes(role.name)) ?? [];
  const candidates = people?.filter((p) => !p.roles.includes(role.name)) ?? [];

  async function saveRoles(p: Person, roles: string[]): Promise<{ error?: string }> {
    const res = await setMemberRoles(p.id, roles);
    if ("error" in res) return { error: res.error };
    router.refresh();
    return {};
  }

  return (
    <div className="grid content-start gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold capitalize">{role.name}</h2>
        {role.id === null ? (
          <Badge variant="secondary">
            <LockIcon /> Locked
          </Badge>
        ) : (
          <>
            <OrgRoleDialog
              resources={resources}
              grantable={grantable}
              initial={{ name: role.name, permission: role.permission }}
              trigger={
                <Button variant="outline" size="sm" disabled={!canUpdate}>
                  <PencilIcon /> Edit
                </Button>
              }
              onSave={(input) =>
                updateRole(role.id as string, input).then((res) => ("error" in res ? { error: res.error } : {}))
              }
            />
            <DeleteRole role={role} id={role.id} disabled={!canDelete} />
          </>
        )}
        <span className="text-xs text-muted-foreground">{memberCount(role.members)}</span>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-6">
        {resources.map((r) => (
          <section key={r.resource} className="grid gap-2" aria-label={r.label}>
            <h3 className="text-sm font-medium">{r.label}</h3>
            <ul className="divide-y">
              {r.actions.map((a) => {
                const id = `perm-${r.resource}-${a.action}`;
                const allowed = grantable[r.resource]?.includes(a.action) ?? false;
                return (
                  <li key={a.action} className="flex items-center gap-3 py-2.5 first:pt-0">
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <Label htmlFor={id} className="text-sm font-normal">
                        {a.label}
                      </Label>
                      {!allowed && !readOnly && (
                        <span className="text-xs text-muted-foreground">You don&apos;t have this permission</span>
                      )}
                    </div>
                    <Switch
                      id={id}
                      checked={perm[r.resource]?.includes(a.action) ?? false}
                      disabled={readOnly || !canUpdate || !allowed || pending}
                      onCheckedChange={(on) => toggle(r.resource, a.action, on)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {people && (
        <section className="grid gap-3" aria-label="Members with this role">
          <h3 className="text-sm font-medium">Members with this role</h3>
          {holders.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              message="Nobody has this role yet"
              action={candidates.length > 0 ? <AddHolder candidates={candidates} role={role.name} /> : undefined}
            />
          ) : (
            <>
              <ul className="divide-y">
                {holders.map((p) => (
                  <li key={p.id} className="grid gap-2 py-2.5 first:pt-0">
                    <div className="grid gap-0.5">
                      <span className="text-sm font-medium">{p.name}</span>
                      {p.email && <span className="text-xs text-muted-foreground">{p.email}</span>}
                    </div>
                    <RoleChips
                      roles={p.roles}
                      options={roleOptions}
                      onAdd={(r) => saveRoles(p, [...p.roles, r])}
                      onRemove={(r) => saveRoles(p, p.roles.filter((x) => x !== r))}
                      disabledReason={(r, op) => reason?.(p, r, op) ?? null}
                    />
                  </li>
                ))}
              </ul>
              {candidates.length > 0 && <AddHolder candidates={candidates} role={role.name} />}
            </>
          )}
        </section>
      )}
    </div>
  );
}

export function RolesList({
  resources,
  grantable,
  roles,
  selected,
  canCreate,
  canUpdate,
  canDelete,
  people,
  roleOptions,
  selfEmail,
}: Props) {
  const router = useRouter();
  const current = roles.find((r) => r.name === selected) ?? null;
  const builtIn = roles.filter((r) => r.id === null);
  const custom = roles.filter((r) => r.id !== null);
  const create = (
    <OrgRoleDialog
      resources={resources}
      grantable={grantable}
      trigger={
        <Button size="sm">
          <PlusIcon /> New role
        </Button>
      }
      onSave={(input) => createRole(input).then((r) => ("error" in r ? { error: r.error } : {}))}
    />
  );

  const list = (
    <div className="grid content-start gap-6">
      <section className="grid gap-2" aria-label="Built-in roles">
        <h3 className="px-3 text-sm font-medium">Built-in</h3>
        <ul className="grid gap-0.5">
          {builtIn.map((r) => (
            <RoleLink key={r.name} role={r} active={current?.name === r.name} />
          ))}
        </ul>
      </section>
      <section className="grid gap-2" aria-label="Custom roles">
        <div className="flex items-center justify-between gap-3 px-3">
          <h3 className="text-sm font-medium">Custom</h3>
          {canCreate && custom.length > 0 && create}
        </div>
        {custom.length === 0 ? (
          <EmptyState icon={ShieldCheckIcon} message="No custom roles yet" action={canCreate ? create : undefined} />
        ) : (
          <ul className="grid gap-0.5">
            {custom.map((r) => (
              <RoleLink key={r.name} role={r} active={current?.name === r.name} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  return (
    <RoleMasterDetail
      selectedId={current?.name ?? null}
      mobileBack={{ label: "All roles", onBack: () => router.push(ROLES) }}
      list={list}
      detail={
        current ? (
          <RoleDetail
            // Re-seeds the switches when the server set changes (Edit dialog save, refresh).
            key={`${current.name}:${JSON.stringify(current.permission)}`}
            role={current}
            resources={resources}
            grantable={grantable}
            canUpdate={canUpdate}
            canDelete={canDelete}
            people={people}
            roleOptions={roleOptions}
            selfEmail={selfEmail}
          />
        ) : (
          <EmptyState icon={ShieldCheckIcon} message="Select a role to see what it can do." />
        )
      }
    />
  );
}

export function RolesListSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      {[3, 2].map((rows) => (
        <div key={rows} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}
