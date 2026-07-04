"use client";

import { Role, type RoleValue } from "@realm/commons";
import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { setUserFlag, setUserRole } from "./actions";

type FlagState = { id: string; key: string; label: string; enabled: boolean };

export function UserRow({
  user,
  flags,
}: {
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    role: RoleValue;
  };
  flags: FlagState[];
}) {
  const [pending, start] = useTransition();
  return (
    <TableRow>
      <TableCell>{user.email ?? user.phone ?? "—"}</TableCell>
      <TableCell>
        <Select
          defaultValue={user.role}
          onValueChange={(v) => start(() => setUserRole(user.id, v as RoleValue))}
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
                onCheckedChange={(c) => start(() => setUserFlag(user.id, f.id, c))}
                disabled={pending}
              />
              {f.label}
            </label>
          ))}
        </div>
      </TableCell>
    </TableRow>
  );
}
