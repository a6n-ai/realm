import { FormError } from "@foundry/console/form-error";
import { Button } from "@foundry/ui/button";
import { Checkbox } from "@foundry/ui/checkbox";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { PERMISSION_GROUPS, type Permission } from "../../lib/auth/permissions";
import { errorText } from "../../lib/error-copy";
import { createRoleFn, updateRoleFn } from "../../lib/roles/roles.fns";
import { ResponsiveDialog } from "../responsive-dialog";

export type RoleDialogMode = { kind: "create" } | { kind: "edit"; name: string; permissions: Permission[] };

// Ticks you cannot grant stay disabled: nobody can build a role stronger than their own.
export function PermissionGrid({ value, onChange, mine }: { value: Permission[]; onChange: (next: Permission[]) => void; mine: Permission[] }) {
  const toggle = (p: Permission, on: boolean) => onChange(on ? [...new Set([...value, p])] : value.filter((x) => x !== p));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {PERMISSION_GROUPS.map((g) => (
        <fieldset key={g.resource} className="grid content-start gap-2">
          <legend className="mb-1 text-sm font-medium text-(--strong)">{g.label}</legend>
          {g.actions.map((a) => {
            const id = `perm-${a.permission.replace(":", "-")}`;
            const allowed = mine.includes(a.permission);
            return (
              <label key={a.permission} htmlFor={id} className="flex items-center gap-2 text-sm data-[off=true]:text-muted-foreground" data-off={!allowed}>
                <Checkbox id={id} checked={value.includes(a.permission)} disabled={!allowed} onCheckedChange={(on) => toggle(a.permission, on === true)} />
                {a.label}
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

export function RoleDialog({ mode, mine, open, onOpenChange }: { mode: RoleDialogMode; mine: Permission[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [name, setName] = useState(mode.kind === "edit" ? mode.name : "");
  const [perms, setPerms] = useState<Permission[]>(mode.kind === "edit" ? mode.permissions : []);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const data = { name: name.trim().toLowerCase(), permissions: perms };
      const res = mode.kind === "create" ? await createRoleFn({ data }) : await updateRoleFn({ data });
      if (!res.ok) return setError(errorText(new Error(res.code)));
      toast.success(mode.kind === "create" ? `Role ${data.name} created` : `Role ${data.name} saved`);
      onOpenChange(false);
      await router.invalidate();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={mode.kind === "create" ? "Create role" : `Edit ${mode.name}`}>
      <form onSubmit={submit} className="grid gap-5">
        {mode.kind === "create" ? (
          <div className="grid gap-2">
            <Label htmlFor="role-name">Name</Label>
            <Input id="role-name" required maxLength={32} placeholder="sales-lead" value={name} onChange={(e) => setName(e.target.value)} />
            <p className="text-sm text-muted-foreground">Lowercase letters, numbers, - and _. The name cannot change later.</p>
          </div>
        ) : null}
        <PermissionGrid value={perms} onChange={setPerms} mine={mine} />
        <FormError error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || perms.length === 0}>
            {mode.kind === "create" ? "Create role" : "Save role"}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
