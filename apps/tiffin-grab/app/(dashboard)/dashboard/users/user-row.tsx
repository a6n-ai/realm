"use client";

import Link from "next/link";
import { Role, type RoleValue } from "@realm/commons";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";
import { Switch } from "@realm/ui/switch";
import { TableCell } from "@realm/ui/table";
import { resetStaffPassword, setUserFlag, setUserRole, setUserStatus, type UserStatusValue } from "./actions";
import type { UserListRow } from "./users-list";

const USER_STATUSES: UserStatusValue[] = ["active", "inactive", "suspended", "deleted"];

export function StatusSelect({ id, status }: { id: string; status: UserStatusValue }) {
  const [pending, start] = useTransition();
  return (
    <Select
      value={status}
      onValueChange={(v) =>
        start(async () => {
          try {
            await setUserStatus(id, v as UserStatusValue);
          } catch {
            toast.error("Could not change status.");
          }
        })
      }
      disabled={pending}
    >
      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
      <SelectContent>
        {USER_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>{s}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Interactive controls extracted so both the desktop table row (cells) and the
// mobile card can render them — each owns its own pending transition.
export function RoleSelect({ id, role }: { id: string; role: RoleValue }) {
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

export function FlagToggles({ id, flags }: { id: string; flags: FlagState[] }) {
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
export function ResetPasswordButton({ id, role }: { id: string; role: RoleValue }) {
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

export type FlagState = { id: string; key: string; label: string; enabled: boolean };

// Returns only the <TableCell> children — DataTable supplies the wrapping
// <TableRow>. Interactive role/flag controls stay client-side here.
export function UserRow({ id, name, email, phone, role, status, flags }: UserListRow) {
  return (
    <>
      <TableCell>
        <Link href={`/dashboard/users/${id}`} className="font-medium underline-offset-4 hover:underline">
          {name || "—"}
        </Link>
      </TableCell>
      <TableCell>{email ?? phone ?? "—"}</TableCell>
      <TableCell><RoleSelect id={id} role={role} /></TableCell>
      <TableCell><StatusSelect id={id} status={status} /></TableCell>
      <TableCell><FlagToggles id={id} flags={flags} /></TableCell>
      <TableCell><ResetPasswordButton id={id} role={role} /></TableCell>
    </>
  );
}

// Mobile card variant — UserRow returns <td>s (a component, so DataTable can't
// auto-derive a card from it); this renders the same controls as card content.
export function UserRowCard({ id, name, email, phone, role, status, flags }: UserListRow) {
  return (
    <div className="space-y-3">
      <Link href={`/dashboard/users/${id}`} className="text-base font-medium underline-offset-4 hover:underline">
        {name || email || phone || "—"}
      </Link>
      {(email || phone) && <div className="text-muted-foreground text-sm">{email ?? phone}</div>}
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">Role</span>
        <RoleSelect id={id} role={role} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">Status</span>
        <StatusSelect id={id} status={status} />
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
