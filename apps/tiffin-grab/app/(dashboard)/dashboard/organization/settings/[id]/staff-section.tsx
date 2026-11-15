"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UsersIcon } from "lucide-react";
import { RoleChips, chipState } from "@foundry/crm";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { EmptyState } from "@/components/ds";
import { addMemberAction, removeMemberAction } from "@/lib/services/organizations-actions";
import type { RoleChoice } from "@/lib/auth/role-options";
import type { UserSearchRow } from "@/lib/services/organizations.service";
import { setMemberRolesIn } from "../../members/actions";
import { UserPicker } from "../user-picker";

export type StaffRow = { memberId: string; userId: string; email: string; roles: string[] };

// Every write names this client's id, so it authorizes in this org, not the active one.
export function StaffSection({
  organizationId,
  rows,
  options,
  selfUserId,
}: {
  organizationId: string;
  rows: StaffRow[];
  options: RoleChoice[];
  selfUserId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<UserSearchRow | null>(null);
  const [addRole, setAddRole] = useState("");
  const [removing, setRemoving] = useState<StaffRow | null>(null);
  const owners = rows.filter((r) => r.roles.includes("owner")).length;
  const aboveViewer = options.filter((o) => o.locked).map((o) => o.value);

  async function assign(row: StaffRow, roles: string[]): Promise<{ error?: string }> {
    const res = await setMemberRolesIn(organizationId, row.memberId, roles);
    if ("error" in res) return { error: res.error };
    router.refresh();
    return {};
  }

  function add() {
    if (!picked || !addRole) return;
    start(async () => {
      const res = await addMemberAction(organizationId, picked.publicId, addRole);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPicked(null);
      setAddRole("");
      router.refresh();
    });
  }

  function remove() {
    if (!removing) return;
    start(async () => {
      const res = await removeMemberAction(organizationId, removing.userId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRemoving(null);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6">
      {rows.length === 0 ? (
        <EmptyState icon={UsersIcon} message="No staff in this client yet." />
      ) : (
        <ul className="grid gap-4">
          {rows.map((row) => {
            const self = row.userId === selfUserId;
            const ctx = {
              self,
              roleCount: row.roles.length,
              targetAboveViewer: row.roles.some((r) => aboveViewer.includes(r)),
              lastOwnerRole: owners <= 1 ? "owner" : undefined,
              aboveViewer,
            };
            return (
              <li key={row.memberId} className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium">{row.email}</span>
                  <Button variant="ghost" size="sm" disabled={self || pending} onClick={() => setRemoving(row)}>
                    Remove
                  </Button>
                </div>
                <RoleChips
                  key={row.roles.join(",")}
                  roles={row.roles}
                  options={options}
                  onAdd={(role) => assign(row, [...row.roles, role])}
                  onRemove={(role) => assign(row, row.roles.filter((r) => r !== role))}
                  disabledReason={(role, op) => chipState(role, op, ctx)}
                />
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <UserPicker onSelect={setPicked} />
        <span className="text-sm text-muted-foreground">{picked ? picked.email : ""}</span>
        <Select value={addRole} onValueChange={setAddRole}>
          <SelectTrigger size="sm" className="min-w-40" aria-label="Role">
            <SelectValue placeholder="Choose a role" />
          </SelectTrigger>
          <SelectContent>
            {options.filter((o) => !o.locked).map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={!picked || !addRole || pending} onClick={add}>
          Add to client
        </Button>
      </div>

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.email} from this client?</DialogTitle>
            <DialogDescription>They lose access to this client right away. You can add them back later.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Keep</Button>
            </DialogClose>
            <Button variant="destructive" disabled={pending} onClick={remove}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
