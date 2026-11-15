"use client";

import { useState, useTransition } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import type { PermissionMap, ResourceLabel } from "@foundry/crm";
import { Button } from "@foundry/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@foundry/ui/dialog";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { PermissionGroupsEditor } from "@/components/ds/permission-groups-editor";
import { createRole, updateRole } from "./actions";
import { validateRoleName } from "./role-name";

const UNKNOWN = "Something went wrong. Try again.";

function NameField({ id, value, onChange, error }: { id: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Role name</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} autoComplete="off" />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// Mounted only while the dialog is open, so every open starts from an empty draft.
function NewRoleForm({
  resources,
  grantable,
  onCreated,
  onCancel,
}: {
  resources: ResourceLabel[];
  grantable: PermissionMap;
  onCreated: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [permission, setPermission] = useState<PermissionMap>({});
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const nameError = name.trim() === "" ? undefined : validateRoleName(name);

  function submit() {
    const invalid = validateRoleName(name);
    if (invalid) return setError(invalid);
    const trimmed = name.trim();
    start(async () => {
      let res: { error?: string };
      try {
        const r = await createRole({ name: trimmed, permission });
        res = "error" in r ? { error: r.error } : {};
      } catch (err) {
        res = { error: err instanceof Error && err.message ? err.message : UNKNOWN };
      }
      if (res.error) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("Role created.");
      onCreated(trimmed);
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create role</DialogTitle>
        <DialogDescription>Choose what members with this role can do.</DialogDescription>
      </DialogHeader>
      <div className="grid max-h-[70vh] gap-4 overflow-y-auto">
        <NameField
          id="new-role-name"
          value={name}
          onChange={(v) => {
            setName(v);
            setError(undefined);
          }}
          error={nameError}
        />
        <PermissionGroupsEditor value={permission} onChange={setPermission} resources={resources} grantable={grantable} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || name.trim() === "" || Boolean(nameError)}>
          {pending ? "Creating…" : "Create role"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function NewRoleDialog({
  resources,
  grantable,
  onCreated,
}: {
  resources: ResourceLabel[];
  grantable: PermissionMap;
  onCreated: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon /> New role
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <NewRoleForm
          resources={resources}
          grantable={grantable}
          onCreated={(name) => {
            setOpen(false);
            onCreated(name);
          }}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function RenameRoleForm({
  roleId,
  current,
  saved,
  onDone,
}: {
  roleId: string;
  current: string;
  saved: PermissionMap;
  onDone: (name: string) => void;
}) {
  const [name, setName] = useState(current);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const nameError = name.trim() === "" ? undefined : validateRoleName(name);

  function submit() {
    const invalid = validateRoleName(name);
    if (invalid) return setError(invalid);
    const trimmed = name.trim();
    start(async () => {
      let res: { error?: string };
      try {
        // Name only: the permissions go back unchanged, so unsaved draft edits are not written.
        const r = await updateRole(roleId, { name: trimmed, permission: saved });
        res = "error" in r ? { error: r.error } : {};
      } catch (err) {
        res = { error: err instanceof Error && err.message ? err.message : UNKNOWN };
      }
      if (res.error) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("Role updated.");
      onDone(trimmed);
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Rename role</DialogTitle>
        <DialogDescription>Members keep this role under the new name.</DialogDescription>
      </DialogHeader>
      <NameField
        id="rename-role-name"
        value={name}
        onChange={(v) => {
          setName(v);
          setError(undefined);
        }}
        error={nameError}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={() => onDone(current)} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || name.trim() === "" || Boolean(nameError)}>
          {pending ? "Saving…" : "Save name"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function RenameRoleDialog({
  roleId,
  current,
  saved,
  disabled,
  onRenamed,
}: {
  roleId: string;
  current: string;
  saved: PermissionMap;
  disabled: boolean;
  onRenamed: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          Rename
        </Button>
      </DialogTrigger>
      <DialogContent>
        <RenameRoleForm
          roleId={roleId}
          current={current}
          saved={saved}
          onDone={(name) => {
            setOpen(false);
            if (name !== current) onRenamed(name);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
