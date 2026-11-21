"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@foundry/ui/toast";
import { EllipsisIcon, UserMinusIcon } from "lucide-react";
import { chipState } from "@foundry/crm";
import { Button } from "@foundry/ui/button";
import { Checkbox } from "@foundry/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@foundry/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { Label } from "@foundry/ui/label";
import { removeMemberAction } from "@/lib/services/organizations-actions";
import { setMemberRoles } from "./actions";
import type { PeopleRow } from "./people-rows";
import type { RoleCtx } from "./user-row";

const heldRoles = (orgRole: string) => orgRole.split(",").map((r) => r.trim()).filter(Boolean);

/** Checkbox per role; a role the server would refuse is disabled with its reason. */
export function EditMemberRolesDialog({
  row,
  ctx,
  open,
  onOpenChange,
}: {
  row: PeopleRow;
  ctx: RoleCtx;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(heldRoles(row.orgRole));
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const reasonFor = (role: string) =>
    chipState(role, selected.includes(role) ? "remove" : "add", {
      self: row.isSelf,
      roleCount: row.roles.length,
      targetAboveViewer: row.targetAboveViewer,
      lastOwnerRole: ctx.owners <= 1 ? "owner" : undefined,
      aboveViewer: ctx.aboveViewer,
    });
  const toggle = (role: string, on: boolean) =>
    setSelected((s) => (on ? [...s.filter((r) => r !== role), role] : s.filter((r) => r !== role)));
  const changed = selected.toSorted().join() !== heldRoles(row.orgRole).sort().join();

  function handleOpenChange(next: boolean) {
    if (next) {
      setSelected(heldRoles(row.orgRole));
      setError(undefined);
    }
    onOpenChange(next);
  }

  function save() {
    setError(undefined);
    start(async () => {
      const res = await setMemberRoles(row.memberId, selected);
      if ("error" in res) return void setError(res.error);
      toast.success("Roles updated.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit roles for {row.name || row.email || "this person"}</DialogTitle>
          <DialogDescription>Their access is the union of the roles they hold.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {ctx.options.map((o) => {
            const reason = reasonFor(o.value);
            const id = `role-${row.memberId}-${o.value}`;
            return (
              <div key={o.value} className="flex items-start gap-3">
                <Checkbox
                  id={id}
                  checked={selected.includes(o.value)}
                  disabled={pending || reason !== null}
                  onCheckedChange={(on) => toggle(o.value, on === true)}
                />
                <div className="grid gap-0.5">
                  <Label htmlFor={id}>{o.label}</Label>
                  {reason && <span className="text-xs text-muted-foreground">{reason}</span>}
                </div>
              </div>
            );
          })}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={pending || !changed || selected.length === 0} onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveMemberDialog({
  row,
  open,
  onOpenChange,
}: {
  row: PeopleRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const remove = () => {
    setError(undefined);
    start(async () => {
      const res = await removeMemberAction(row.organizationId, row.id);
      if (!res.ok) return void setError(res.error);
      toast.success("Removed from this organization.");
      onOpenChange(false);
      router.refresh();
    });
  };
  return (
    <AlertDialog open={open} onOpenChange={(o) => { onOpenChange(o); if (o) setError(undefined); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {row.name || row.email || "this person"}?</AlertDialogTitle>
          <AlertDialogDescription>They lose access to this organization. You can invite them again later.</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>Keep</AlertDialogClose>
          <Button variant="destructive" disabled={pending} onClick={remove}>Remove</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Dialogs sit outside the menu so they stay mounted after it closes.
export function MemberRowMenu({ row, ctx, href }: { row: PeopleRow; ctx: RoleCtx; href: string }) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.name || row.email || "this person"}`} />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={href} />}>Open</DropdownMenuItem>
          <DropdownMenuItem disabled={row.isSelf} onSelect={() => setEditing(true)}>
            Edit roles
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" disabled={row.isSelf} onSelect={() => setRemoving(true)}>
            <UserMinusIcon /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditMemberRolesDialog row={row} ctx={ctx} open={editing} onOpenChange={setEditing} />
      <RemoveMemberDialog row={row} open={removing} onOpenChange={setRemoving} />
    </>
  );
}
