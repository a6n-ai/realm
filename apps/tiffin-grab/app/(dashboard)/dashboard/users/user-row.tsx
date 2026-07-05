"use client";

import { Role, type RoleValue } from "@realm/commons";
import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";
import { Switch } from "@realm/ui/switch";
import { TableCell } from "@realm/ui/table";
import { setUserFlag, setUserRole } from "./actions";
import type { UserListRow } from "./users-list";

// Returns only the <TableCell> children — DataTable supplies the wrapping
// <TableRow>. Interactive role/flag controls stay client-side here.
export function UserRow({ id, email, phone, role, flags }: UserListRow) {
  const [pending, start] = useTransition();
  return (
    <>
      <TableCell>{email ?? phone ?? "—"}</TableCell>
      <TableCell>
        <Select
          defaultValue={role}
          onValueChange={(v) => start(() => setUserRole(id, v as RoleValue))}
          disabled={pending}
        >
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.values(Role).map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-3">
          {flags.map((f) => (
            <label key={f.id} className="flex items-center gap-2 text-sm">
              <Switch
                checked={f.enabled}
                onCheckedChange={(c) => start(() => setUserFlag(id, f.id, c))}
                disabled={pending}
              />
              {f.label}
            </label>
          ))}
        </div>
      </TableCell>
    </>
  );
}
