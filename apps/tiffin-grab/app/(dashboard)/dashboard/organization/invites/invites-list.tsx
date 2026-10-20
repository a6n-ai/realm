"use client";
/* eslint-disable react-hooks/purity */
import type { ReactNode } from "react";
import { AppDate } from "@/components/dashboard/app-date";
import { useTransition } from "react";
import { toast } from "sonner";
import { MailIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { TableCell } from "@foundry/ui/table";
import { DataTable, type Column } from "@/components/ds";
import { cancelInvitation, resendInvite } from "../members/actions";
import { StatusBadge } from "../status-badge";

export type InviteRow = {
  id: string;
  userId: string; // users.publicId, needed for resendInvite's signature
  email: string;
  role: string;
  status: "pending" | "accepted" | "rejected" | "canceled";
  expiresAt: string; // ISO
  organizationId: string;
};

const COLUMNS: readonly Column<"email" | "role" | "status" | "expiresAt" | "actions">[] = [
  { key: "email", label: "Email" },
  { key: "role", label: "Role" },
  { key: "status", label: "Status" },
  { key: "expiresAt", label: "Expires" },
  { key: "actions", label: "" },
];

// actionableOrgIds: orgs the viewer is a direct member of — the only ones where
// better-auth's createInvitation/cancelInvitation won't reject with MEMBER_NOT_FOUND.
export function InvitesList({
  rows,
  actionableOrgIds,
  emptyAction,
}: {
  rows: InviteRow[];
  actionableOrgIds: string[];
  emptyAction?: ReactNode;
}) {
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
  // Date.now(): "expired" is a pending invite past its expiry right now; the DB only stores "pending".
  const expired = row.status === "pending" && new Date(row.expiresAt).getTime() < Date.now();
  const status = expired ? "expired" : row.status;

  const resend = () =>
    start(async () => {
      try {
        await resendInvite(row.userId, row.organizationId);
        toast.success("Invite resent");
      } catch {
        toast.error("Could not resend the invite.");
      }
    });
  const cancel = () =>
    start(async () => {
      try {
        await cancelInvitation(row.id);
        toast.success("Invitation canceled");
      } catch {
        toast.error("Could not cancel — it may have already been accepted or canceled.");
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
