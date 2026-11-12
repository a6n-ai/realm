"use client";
/* eslint-disable react-hooks/purity */
import type { ReactNode } from "react";
import { AppDate } from "@/components/dashboard/app-date";
import { useTransition } from "react";
import { toast } from "sonner";
import { MailIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { TableCell } from "@foundry/ui/table";
import { usePathname, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { DataTable, useListNav, type Column } from "@/components/ds";
import type { InviteBucket } from "../org-stats";
import { unwrapAction } from "@/lib/actions/unwrap";
import { cancelInvitation, resendInvite } from "../members/actions";
import { StatusBadge } from "../status-badge";
import { isInviteExpired, type InviteRow } from "./invite-status";

export type { InviteRow };

const COLUMNS: readonly Column<"email" | "role" | "status" | "expiresAt" | "actions">[] = [
  { key: "email", label: "Email" },
  { key: "role", label: "Role" },
  { key: "status", label: "Status" },
  { key: "expiresAt", label: "Expires" },
  { key: "actions", label: "" },
];

// actionableOrgIds: orgs the viewer is a direct member of — the only ones where
// better-auth's createInvitation/cancelInvitation won't reject with MEMBER_NOT_FOUND.
const STATUS_OPTIONS: { value: "all" | InviteBucket; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "expired", label: "Expired" },
  { value: "canceled", label: "Canceled" },
];

export function InvitesList({
  rows,
  status = "all",
  actionableOrgIds,
  emptyAction,
}: {
  rows: InviteRow[];
  status?: "all" | InviteBucket;
  actionableOrgIds: string[];
  emptyAction?: ReactNode;
}) {
  const nav = useListNav();
  const pathname = usePathname();
  const params = useSearchParams();
  const setStatus = (value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value === "all") sp.delete("status");
    else sp.set("status", value);
    const qs = sp.toString();
    nav(qs ? `${pathname}?${qs}` : pathname);
  };
  const canAct = (r: InviteRow) => actionableOrgIds.includes(r.organizationId);
  return (
    <DataTable
      pagination="client"
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.id}
      emptyIcon={MailIcon}
      emptyMessage="No pending invites."
      emptySearchMessage="No invites match your search."
      emptyAction={emptyAction}
      filters={
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      renderRow={(r) => <InviteRowCells row={r} canAct={canAct(r)} />}
      mobileCard={(r) => <InviteRowCard row={r} canAct={canAct(r)} />}
    />
  );
}

export function InvitesListSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}

// Shared by the table row and the mobile card: what the row shows and the one action it offers.
function useInvite(row: InviteRow, canAct: boolean) {
  const [pending, start] = useTransition();
  const expired = isInviteExpired(row.status, row.expiresAt, Date.now());
  const status = expired ? "expired" : row.status;

  const resend = () =>
    start(async () => {
      try {
        await unwrapAction(resendInvite(row.userId, row.organizationId));
        toast.success("Invite resent");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not resend the invite.");
      }
    });
  const cancel = () =>
    start(async () => {
      try {
        await unwrapAction(cancelInvitation(row.id));
        toast.success("Invitation canceled");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not cancel the invitation.");
      }
    });

  const action =
    canAct && (row.status === "pending" || expired)
      ? expired
        ? { label: "Resend", variant: "outline" as const, run: resend }
        : { label: "Cancel", variant: "ghost" as const, run: cancel }
      : null;

  return { pending, status, action };
}

function InviteRowCells({ row, canAct }: { row: InviteRow; canAct: boolean }) {
  const { pending, status, action } = useInvite(row, canAct);
  return (
    <>
      <TableCell className="font-medium">{row.email}</TableCell>
      <TableCell className="capitalize">{row.role}</TableCell>
      <TableCell>
        <StatusBadge status={status} />
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums">
        <AppDate value={row.expiresAt} />
      </TableCell>
      <TableCell className="text-right">
        {action && (
          <Button variant={action.variant} size="sm" disabled={pending} onClick={action.run}>
            {action.label}
          </Button>
        )}
      </TableCell>
    </>
  );
}

// Mobile card variant — InviteRowCells returns <td>s (a component, so DataTable can't
// auto-derive a card from it); this renders the same controls as card content.
function InviteRowCard({ row, canAct }: { row: InviteRow; canAct: boolean }) {
  const { pending, status, action } = useInvite(row, canAct);
  return (
    <div className="flex flex-col gap-3">
      <div className="text-base font-medium">{row.email}</div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">Role</span>
        <span className="text-sm capitalize">{row.role}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">Status</span>
        <StatusBadge status={status} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">Expires</span>
        <span className="text-muted-foreground text-sm tabular-nums">
          <AppDate value={row.expiresAt} />
        </span>
      </div>
      {action && (
        <Button variant={action.variant} size="sm" disabled={pending} onClick={action.run} className="w-full">
          {action.label}
        </Button>
      )}
    </div>
  );
}
