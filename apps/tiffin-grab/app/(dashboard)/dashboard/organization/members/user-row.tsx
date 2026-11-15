"use client";

import { isCustomerRole } from "@/lib/roles";
import Link from "next/link";
import { formatPhone, type RoleValue } from "@foundry/commons";
import { useTransition } from "react";
import { KeyRound, SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { TableCell } from "@foundry/ui/table";
import { Badge } from "@/components/reui/badge";
import { AppDate } from "@/components/dashboard/app-date";
import { UserAvatar } from "@/components/ds";
import { unwrapAction } from "@/lib/actions/unwrap";
import { sendStaffAccessEmail, setUserStatus, type UserStatusValue } from "./actions";
import type { PeopleRow } from "./people-rows";
import { MemberRowMenu } from "./member-row-actions";

const USER_STATUSES: UserStatusValue[] = ["active", "inactive", "suspended", "deleted"];

export function StatusSelect({ id, status }: { id: string; status: UserStatusValue }) {
  const [pending, start] = useTransition();
  return (
    <Select
      value={status}
      onValueChange={(v) =>
        start(async () => {
          try {
            await unwrapAction(setUserStatus(id, v as UserStatusValue));
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not change status.");
          }
        })
      }
      disabled={pending}
    >
      <SelectTrigger size="sm" className="w-36 capitalize"><SelectValue /></SelectTrigger>
      <SelectContent>
        {USER_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>{s}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export type RoleCtx = {
  options: { value: string; label: string; locked?: boolean }[];
  aboveViewer: string[];
  /** Members holding the owner role, for the last-owner rule. */
  owners: number;
};

export function AccessBadges({ row }: { row: PeopleRow }) {
  if (row.fullAccess) return <Badge variant="success-light">Full access</Badge>;
  if (row.areas.length === 0) return <Badge variant="warning-light">No access</Badge>;
  return (
    <span className="flex flex-wrap gap-1">
      {row.areas.map((a) => (
        <Badge key={a.resource} variant="info-light">{a.label}</Badge>
      ))}
    </span>
  );
}

export function RoleBadges({ orgRole, ctx }: { orgRole: string; ctx: RoleCtx }) {
  const roles = orgRole.split(",").map((r) => r.trim()).filter(Boolean);
  if (roles.length === 0) return <Badge variant="warning-light">No role</Badge>;
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <Badge key={r} variant="primary-light">{ctx.options.find((o) => o.value === r)?.label ?? r}</Badge>
      ))}
    </span>
  );
}

// Staff only: mails a reset code when a password is set, otherwise re-sends the invite.
export function ResetPasswordButton({ id, role, passwordSet }: { id: string; role: RoleValue; passwordSet: boolean }) {
  const [pending, start] = useTransition();
  if (isCustomerRole(role)) return null;
  const label = passwordSet ? "Reset password" : "Resend invite";
  const onClick = () =>
    start(async () => {
      try {
        const { email, kind } = await unwrapAction(sendStaffAccessEmail(id));
        toast.success(kind === "reset" ? "Reset code sent" : "Invite resent", {
          description:
            kind === "reset"
              ? `They'll get a 6-digit code at ${email} to set a new password.`
              : `They'll get an invite at ${email} to sign in and choose their password.`,
          duration: 8000,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : passwordSet ? "Could not send the reset code." : "Could not resend the invite.");
      }
    });
  const Icon = passwordSet ? KeyRound : SendHorizonal;
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={onClick}>
      <Icon /> {label}
    </Button>
  );
}

function MemberName({ row, href }: { row: PeopleRow; href: string }) {
  const contact = row.email ?? (row.phone ? formatPhone(row.phone) : null);
  return (
    <Link href={href} className="group flex min-w-0 items-center gap-3">
      <UserAvatar name={row.name} fallbackText={row.email} presence={row.status === "active" ? "active" : "off"} size="sm" />
      <span className="grid min-w-0">
        <span className="truncate font-medium group-hover:underline underline-offset-4">{row.name || "—"}</span>
        <span className="text-muted-foreground truncate text-xs">{contact ?? "No email on file"}</span>
      </span>
    </Link>
  );
}

// Returns only the <TableCell> children; DataTable supplies the <TableRow>.
export function UserRow({ ctx, href, ...r }: PeopleRow & { ctx: RoleCtx; href: string }) {
  return (
    <>
      <TableCell><MemberName row={r} href={href} /></TableCell>
      <TableCell><RoleBadges orgRole={r.orgRole} ctx={ctx} /></TableCell>
      <TableCell><AccessBadges row={r} /></TableCell>
      <TableCell><StatusSelect id={r.id} status={r.status} /></TableCell>
      <TableCell className="text-muted-foreground"><AppDate value={r.joinedAt} /></TableCell>
      <TableCell><MemberRowMenu row={r} ctx={ctx} href={href} /></TableCell>
    </>
  );
}

// Mobile card variant: UserRow returns <td>s, so DataTable needs this explicit card.
export function UserRowCard({ ctx, href, ...r }: PeopleRow & { ctx: RoleCtx; href: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <MemberName row={r} href={href} />
        <MemberRowMenu row={r} ctx={ctx} href={href} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">Roles</span>
        <RoleBadges orgRole={r.orgRole} ctx={ctx} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">Access</span>
        <AccessBadges row={r} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">Status</span>
        <StatusSelect id={r.id} status={r.status} />
      </div>
    </div>
  );
}
