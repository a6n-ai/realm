"use client";

import { useState, useTransition } from "react";
import { LockIcon, PencilIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { OrgRoleDialog, RolePermissionGrid, type PermissionMap, type ResourceLabel } from "@foundry/crm";
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
import { Skeleton } from "@foundry/ui/skeleton";
import { EmptyState } from "@/components/ds";
import { Badge } from "@/components/reui/badge";
import { createRole, deleteRole, updateRole } from "./actions";

type BuiltInRow = { name: string; permission: PermissionMap; members: number };
type CustomRow = { id: string; name: string; permission: PermissionMap; members: number };

type Props = {
  resources: ResourceLabel[];
  grantable: PermissionMap;
  builtIn: BuiltInRow[];
  custom: CustomRow[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

const memberCount = (n: number) => `${n} ${n === 1 ? "member" : "members"}`;

function ViewPermissions({ row, resources }: { row: BuiltInRow; resources: ResourceLabel[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          View
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="capitalize">{row.name}</DialogTitle>
          <DialogDescription>Built-in role. It can't be edited.</DialogDescription>
        </DialogHeader>
        <RolePermissionGrid resources={resources} value={row.permission} grantable={{}} onChange={() => {}} readOnly />
      </DialogContent>
    </Dialog>
  );
}

function DeleteRole({ row, disabled }: { row: CustomRow; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  function confirm() {
    start(async () => {
      const res = await deleteRole(row.id);
      if ("error" in res) return void toast.error(res.error);
      toast.success("Role deleted.");
      setOpen(false);
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} aria-label={`Delete ${row.name}`}>
          <Trash2Icon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {row.name}?</DialogTitle>
          <DialogDescription>
            {row.members > 0
              ? `${memberCount(row.members)} still ${row.members === 1 ? "has" : "have"} this role. Move them to another role first.`
              : "This can't be undone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Keep</Button>
          </DialogClose>
          <Button variant="destructive" disabled={pending || row.members > 0} onClick={confirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RolesList({ resources, grantable, builtIn, custom, canCreate, canUpdate, canDelete }: Props) {
  const createTrigger = (
    <Button size="sm">Create role</Button>
  );
  const create = (
    <OrgRoleDialog
      resources={resources}
      grantable={grantable}
      trigger={createTrigger}
      onSave={(input) => createRole(input).then((r) => ("error" in r ? { error: r.error } : {}))}
    />
  );
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-label="Built-in roles">
        <h3 className="text-sm font-medium">Built-in</h3>
        <ul className="divide-y">
          {builtIn.map((r) => (
            <li key={r.name} className="flex items-center gap-3 py-2.5 first:pt-0">
              <span className="min-w-0 flex-1 truncate text-sm font-medium capitalize">{r.name}</span>
              <Badge variant="secondary">
                <LockIcon /> Locked
              </Badge>
              <span className="text-muted-foreground text-xs">{memberCount(r.members)}</span>
              <ViewPermissions row={r} resources={resources} />
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-3" aria-label="Custom roles">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Custom</h3>
          {canCreate && custom.length > 0 && create}
        </div>
        {custom.length === 0 ? (
          <EmptyState
            icon={ShieldCheckIcon}
            message="No custom roles yet"
            action={canCreate ? create : undefined}
          />
        ) : (
          <ul className="divide-y">
            {custom.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</span>
                <span className="text-muted-foreground text-xs">{memberCount(r.members)}</span>
                <OrgRoleDialog
                  resources={resources}
                  grantable={grantable}
                  initial={{ name: r.name, permission: r.permission }}
                  trigger={
                    <Button variant="outline" size="sm" disabled={!canUpdate}>
                      <PencilIcon /> Edit
                    </Button>
                  }
                  onSave={(input) =>
                    updateRole(r.id, input).then((res) => ("error" in res ? { error: res.error } : {}))
                  }
                />
                <DeleteRole row={r} disabled={!canDelete} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
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
