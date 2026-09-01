"use client";

import Link from "next/link";
import { Role, formatPhone, type RoleValue } from "@foundry/commons";
import { useTransition } from "react";
import { KeyRound, SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Switch } from "@foundry/ui/switch";
import { TableCell } from "@foundry/ui/table";
import { RowActions } from "@foundry/design-system";
import { RowActionTooltipButton, UserAvatar } from "@/components/ds";
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

// Admin-only: mail a staff member the OTP code — the same send either sets up
// a brand-new account (invite never completed) or resets an existing password,
// so one server call covers both; only the label/icon differ by passwordSet.
// Staff rows only. "icon": tooltip icon button for a table row. "button":
// labeled outline button for the detail page header (mirrors customers/[id]'s
// ResendInviteButton).
export function ResetPasswordButton({
  id,
  role,
  passwordSet,
  variant = "icon",
}: {
  id: string;
  role: RoleValue;
  passwordSet: boolean;
  variant?: "icon" | "button";
}) {
  const [pending, start] = useTransition();
  if (role === Role.USER) return null;
  const label = passwordSet ? "Reset password" : "Resend invite";
  const onClick = () =>
    start(async () => {
      try {
        const { email } = await resetStaffPassword(id);
        toast.success(passwordSet ? "Reset code sent" : "Invite resent", {
          description: `They'll get a 6-digit code at ${email} to set ${passwordSet ? "a new" : "their"} password.`,
          duration: 8000,
        });
      } catch {
        toast.error(passwordSet ? "Could not send the reset code." : "Could not resend the invite.");
      }
    });

  if (variant === "button") {
    return (
      <Button variant="outline" size="sm" disabled={pending} onClick={onClick}>
        {label}
      </Button>
    );
  }
  return (
    <RowActionTooltipButton icon={passwordSet ? KeyRound : SendHorizonal} label={label} disabled={pending} onClick={onClick} />
  );
}

export type FlagState = { id: string; key: string; label: string; enabled: boolean };

// Returns only the <TableCell> children — DataTable supplies the wrapping
// <TableRow>. Interactive role/flag controls stay client-side here.
// Feature flags live on the user detail page only (this list row stays lean as
// the flag set grows) — see [id]/page.tsx's own FlagToggles usage.
export function UserRow({ id, name, email, phone, role, status, passwordSet }: UserListRow) {
  return (
    <>
      <TableCell>
        <Link
          href={`/dashboard/organization/users/${id}`}
          className="group flex items-center gap-3 font-medium underline-offset-4 hover:[&>span]:underline"
        >
          <UserAvatar name={name} fallbackText={email} presence={status === "active" ? "active" : "off"} size="sm" />
          <span>{name || "—"}</span>
        </Link>
      </TableCell>
      <TableCell>{email ?? (phone ? formatPhone(phone) : null) ?? "—"}</TableCell>
      <TableCell><RoleSelect id={id} role={role} /></TableCell>
      <TableCell><StatusSelect id={id} status={status} /></TableCell>
      <TableCell>
        <RowActions>
          <ResetPasswordButton id={id} role={role} passwordSet={passwordSet} />
        </RowActions>
      </TableCell>
    </>
  );
}

// Mobile card variant — UserRow returns <td>s (a component, so DataTable can't
// auto-derive a card from it); this renders the same controls as card content.
export function UserRowCard({ id, name, email, phone, role, status, passwordSet }: UserListRow) {
  return (
    <div className="space-y-3">
      <Link href={`/dashboard/organization/users/${id}`} className="flex items-center gap-3">
        <UserAvatar name={name} fallbackText={email} presence={status === "active" ? "active" : "off"} />
        <span className="text-base font-medium underline-offset-4 hover:underline">
          {name || email || (phone ? formatPhone(phone) : null) || "—"}
        </span>
      </Link>
      {(email || phone) && <div className="text-muted-foreground text-sm">{email ?? (phone ? formatPhone(phone) : null)}</div>}
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">Role</span>
        <RoleSelect id={id} role={role} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">Status</span>
        <StatusSelect id={id} status={status} />
      </div>
      {role !== Role.USER && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-sm">Password</span>
          <ResetPasswordButton id={id} role={role} passwordSet={passwordSet} />
        </div>
      )}
    </div>
  );
}
