"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";
import { addMemberAction, removeMemberAction, updateMemberRoleAction } from "@/lib/services/organizations-actions";
import type { MemberRole, UserSearchRow } from "@/lib/services/organizations.service";
import { UserPicker } from "./user-picker";

type Row = { organizationId: string; userPublicId: string; label: string; role: MemberRole };

const ROLES: MemberRole[] = ["admin", "owner"];

// Client-detail-page direction only: the organization is fixed and each
// row/add picks a *user*. The inverse (user-detail page picking an org) is
// out of scope for this plan — see task-3 brief.
export function MemberManagement({ rows, organizationId }: { rows: Row[]; organizationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pickedUser, setPickedUser] = useState<UserSearchRow | null>(null);
  const [addRole, setAddRole] = useState<MemberRole>("admin");

  function handleAdd() {
    if (!pickedUser) return;
    startTransition(async () => {
      const result = await addMemberAction(organizationId, pickedUser.publicId, addRole);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPickedUser(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div
          key={row.organizationId + row.userPublicId}
          className="flex items-center justify-between gap-2 rounded border p-2"
        >
          <div className="text-sm font-medium">{row.label}</div>
          <div className="flex items-center gap-2">
            <Select
              value={row.role}
              disabled={pending}
              onValueChange={(value) => {
                startTransition(async () => {
                  const result = await updateMemberRoleAction(row.organizationId, row.userPublicId, value as MemberRole);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  router.refresh();
                });
              }}
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  await removeMemberAction(row.organizationId, row.userPublicId);
                  router.refresh();
                });
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <UserPicker onSelect={setPickedUser} />
        <Select value={addRole} onValueChange={(value) => setAddRole(value as MemberRole)}>
          <SelectTrigger className="h-9 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button disabled={pending || !pickedUser} onClick={handleAdd}>
          Add
        </Button>
      </div>
    </div>
  );
}
