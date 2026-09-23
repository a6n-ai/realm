"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { addMemberAction, removeMemberAction, updateMemberRoleAction } from "@/lib/services/organizations-actions";
import type { MemberRole, UserSearchRow } from "@/lib/services/organizations.service";
import { UserPicker } from "./user-picker";

type Row = { organizationId: string; userPublicId: string; label: string; role: MemberRole };

const ROLES: MemberRole[] = ["admin", "owner"];

// Two call directions share this component: from the client-detail page the
// organization is fixed and each row/add picks a *user*; from the user-detail
// page the user is fixed and each row/add targets an *organization*. There is
// no org-search picker (out of scope, see task-3 brief), so addByOrgId swaps
// the UserPicker for a plain org-id Input on that side.
export function MemberManagement({
  rows,
  fixed,
  addByOrgId = false,
}: {
  rows: Row[];
  fixed: { organizationId: string } | { userPublicId: string };
  addByOrgId?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pickedUser, setPickedUser] = useState<UserSearchRow | null>(null);
  const [orgId, setOrgId] = useState("");
  const [addRole, setAddRole] = useState<MemberRole>("admin");

  const canAdd = addByOrgId ? orgId.trim().length > 0 : pickedUser !== null;

  function handleAdd() {
    const organizationId = "organizationId" in fixed ? fixed.organizationId : orgId.trim();
    const userPublicId = "userPublicId" in fixed ? fixed.userPublicId : (pickedUser?.publicId ?? "");
    startTransition(async () => {
      const result = await addMemberAction(organizationId, userPublicId, addRole);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPickedUser(null);
      setOrgId("");
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
        {addByOrgId ? (
          <Input placeholder="Organization ID" value={orgId} onChange={(e) => setOrgId(e.target.value)} />
        ) : (
          <UserPicker onSelect={setPickedUser} />
        )}
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
        <Button disabled={pending || !canAdd} onClick={handleAdd}>
          Add
        </Button>
      </div>
    </div>
  );
}
