"use client";

import { Role, type RoleValue } from "@realm/commons";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";
import { Switch } from "@realm/ui/switch";
import { TableCell } from "@realm/ui/table";
import { resetStaffPassword, setUserFlag, setUserRole } from "./actions";
import type { UserListRow } from "./users-list";

// Interactive controls extracted so both the desktop table row (cells) and the
// mobile card can render them — each owns its own pending transition.
function RoleSelect({ id, role }: { id: string; role: RoleValue }) {
  const [pending, start] = useTransition();
  return (
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
  );
}

function FlagToggles({ id, flags }: { id: string; flags: FlagState[] }) {
  const [pending, start] = useTransition();
  return (
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
  );
}

// Admin-only: reset a staff member to the shared default password. They are
// forced to set their own on next login; the temp password is shown once here
// for the admin to relay (no email/SMS wired yet). Staff rows only.
function ResetPasswordButton({ id, role }: { id: string; role: RoleValue }) {
  const [pending, start] = useTransition();
  if (role === Role.USER) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const { tempPassword } = await resetStaffPassword(id);
            toast.success(`Temporary password: ${tempPassword}`, {
              description: "Share it with the user — they'll set their own on next login.",
              duration: 12000,
            });
          } catch {
            toast.error("Could not reset password.");
          }
        })
      }
    >
      Reset password
    </Button>
  );
}

type FlagState = { id: string; key: string; label: string; enabled: boolean };

// Returns only the <TableCell> children — DataTable supplies the wrapping
// <TableRow>. Interactive role/flag controls stay client-side here.
export function UserRow({ id, email, phone, role, flags }: UserListRow) {
  return (
    <>
      <TableCell>{email ?? phone ?? "—"}</TableCell>
      <TableCell><RoleSelect id={id} role={role} /></TableCell>
      <TableCell><FlagToggles id={id} flags={flags} /></TableCell>
      <TableCell><ResetPasswordButton id={id} role={role} /></TableCell>
    </>
  );
}

// Mobile card variant — UserRow returns <td>s (a component, so DataTable can't
// auto-derive a card from it); this renders the same controls as card content.
export function UserRowCard({ id, email, phone, role, flags }: UserListRow) {
  return (
    <div className="space-y-3">
      <div className="text-base font-medium">{email ?? phone ?? "—"}</div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">Role</span>
        <RoleSelect id={id} role={role} />
      </div>
      {flags.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-muted-foreground text-sm">Feature flags</span>
          <FlagToggles id={id} flags={flags} />
        </div>
      )}
      {role !== Role.USER && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-sm">Password</span>
          <ResetPasswordButton id={id} role={role} />
        </div>
      )}
    </div>
  );
}
