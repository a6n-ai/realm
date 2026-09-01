"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { DataTable, type Column } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { TableCell } from "@foundry/ui/table";
import { addMemberAction, removeMemberAction, updateMemberRoleAction } from "@/lib/services/organizations-actions";
import type { MemberRole, UserSearchRow } from "@/lib/services/organizations.service";
import { UserPicker } from "./user-picker";

type Row = { organizationId: string; userPublicId: string; label: string; role: MemberRole };

const ROLES: MemberRole[] = ["admin", "owner"];

const COLUMNS: readonly Column<"name" | "role" | "actions">[] = [
  { key: "name", label: "Name" },
  { key: "role", label: "Role" },
  { key: "actions", label: "" },
];

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
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.organizationId + row.userPublicId}
        serial={false}
        search={{
          keys: ["label"],
          placeholder: "Search members…",
          shortPlaceholder: "Search…",
        }}
        emptyIcon={UsersIcon}
        emptyMessage="No members yet."
        emptySearchMessage="No members match your search."
        renderRow={(row) => (
          <>
            <TableCell className="font-medium">{row.label}</TableCell>
            <TableCell>
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
            </TableCell>
            <TableCell>
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
            </TableCell>
          </>
        )}
      />
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
