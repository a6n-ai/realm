"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@foundry/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { UserAvatar } from "@/components/ds";
import { addMemberAction, removeMemberAction, updateMemberRoleAction } from "@/lib/services/organizations-actions";
import type { MemberRole, UserSearchRow } from "@/lib/services/organizations.service";
import { UserPicker } from "./user-picker";

type Row = { organizationId: string; userPublicId: string; label: string; role: MemberRole };

const ROLES: MemberRole[] = ["admin", "owner"];

function RoleSelect({ value, onChange, disabled }: { value: MemberRole; onChange: (r: MemberRole) => void; disabled?: boolean }) {
  return (
    <Select value={value} disabled={disabled} onValueChange={(v) => onChange(v as MemberRole)}>
      <SelectTrigger size="sm" className="w-28 capitalize" aria-label="Role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r} value={r} className="capitalize">
            {r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Two call directions share this component: from the client-detail page the
// organization is fixed and each row/add picks a *user*; from the user-detail
// page the user is fixed and each row/add targets an *organization*, picked
// from `organizations` (the ones the user is not already in).
export function MemberManagement({
  rows,
  fixed,
  organizations,
  emptyMessage = "No members yet.",
}: {
  rows: Row[];
  fixed: { organizationId: string } | { userPublicId: string };
  organizations?: { id: string; name: string }[];
  emptyMessage?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pickedUser, setPickedUser] = useState<UserSearchRow | null>(null);
  const [orgId, setOrgId] = useState("");
  const [addRole, setAddRole] = useState<MemberRole>("admin");
  const [removing, setRemoving] = useState<Row | null>(null);

  const byOrg = organizations !== undefined;
  const canAdd = byOrg ? orgId !== "" : pickedUser !== null;

  function run(action: () => Promise<{ ok: boolean; error?: string } | void>, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result && !result.ok) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      after?.();
      router.refresh();
    });
  }

  function handleAdd() {
    const organizationId = "organizationId" in fixed ? fixed.organizationId : orgId;
    const userPublicId = "userPublicId" in fixed ? fixed.userPublicId : (pickedUser?.publicId ?? "");
    run(
      () => addMemberAction(organizationId, userPublicId, addRole),
      () => {
        setPickedUser(null);
        setOrgId("");
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.organizationId + row.userPublicId} className="flex items-center gap-3 py-2.5 first:pt-0">
              <UserAvatar name={row.label} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.label}</span>
              <RoleSelect
                value={row.role}
                disabled={pending}
                onChange={(role) => run(() => updateMemberRoleAction(row.organizationId, row.userPublicId, role))}
              />
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setRemoving(row)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {byOrg ? (
          <Select value={orgId} onValueChange={setOrgId} disabled={organizations.length === 0}>
            <SelectTrigger size="sm" className="min-w-48 flex-1" aria-label="Organization">
              <SelectValue placeholder={organizations.length === 0 ? "Already in every organization" : "Choose an organization"} />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <UserPicker onSelect={setPickedUser} />
        )}
        <RoleSelect value={addRole} onChange={setAddRole} />
        <Button size="sm" disabled={pending || !canAdd} onClick={handleAdd}>
          Add
        </Button>
      </div>

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.label}?</DialogTitle>
            <DialogDescription>They lose access to this organization right away. You can add them back later.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Keep</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                const row = removing;
                if (!row) return;
                run(() => removeMemberAction(row.organizationId, row.userPublicId), () => setRemoving(null));
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
