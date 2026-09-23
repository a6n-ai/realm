"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { MailIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { TableCell } from "@foundry/ui/table";
import { DataTable, type Column } from "@/components/ds";
import { cancelInvitation, resendInvite } from "../members/actions";

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

export function InvitesList({ rows }: { rows: InviteRow[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.id}
      emptyIcon={MailIcon}
      emptyMessage="No pending invites."
      emptySearchMessage="No invites match your search."
      renderRow={(r) => <InviteRowCells row={r} />}
      mobileCard={(r) => <InviteRowCard row={r} />}
    />
  );
}

function InviteRowCells({ row }: { row: InviteRow }) {
  const [pending, start] = useTransition();
  const expired = row.status === "pending" && new Date(row.expiresAt).getTime() < Date.now();
  const displayStatus = expired ? "expired" : row.status;

  const onResend = () =>
    start(async () => {
      try {
        await resendInvite(row.userId, row.organizationId);
        toast.success("Invite resent");
      } catch {
        toast.error("Could not resend the invite.");
      }
    });
  const onCancel = () =>
    start(async () => {
      try {
        await cancelInvitation(row.id);
        toast.success("Invitation canceled");
      } catch {
        toast.error("Could not cancel — it may have already been accepted or canceled.");
      }
    });

  return (
    <>
      <TableCell className="font-medium">{row.email}</TableCell>
      <TableCell>{row.role}</TableCell>
      <TableCell><Badge variant={displayStatus === "pending" ? "default" : "secondary"}>{displayStatus}</Badge></TableCell>
      <TableCell className="text-muted-foreground">{new Date(row.expiresAt).toLocaleDateString()}</TableCell>
      <TableCell>
        {(row.status === "pending" || expired) &&
          (expired ? (
            <Button variant="outline" size="sm" disabled={pending} onClick={onResend}>Resend</Button>
          ) : (
            <Button variant="ghost" size="sm" disabled={pending} onClick={onCancel}>Cancel</Button>
          ))}
      </TableCell>
    </>
  );
}

// Mobile card variant — InviteRowCells returns <td>s (a component, so DataTable can't
// auto-derive a card from it); this renders the same controls as card content.
function InviteRowCard({ row }: { row: InviteRow }) {
  const [pending, start] = useTransition();
  const expired = row.status === "pending" && new Date(row.expiresAt).getTime() < Date.now();
  const displayStatus = expired ? "expired" : row.status;

  const onResend = () =>
    start(async () => {
      try {
        await resendInvite(row.userId, row.organizationId);
        toast.success("Invite resent");
      } catch {
        toast.error("Could not resend the invite.");
      }
    });
  const onCancel = () =>
    start(async () => {
      try {
        await cancelInvitation(row.id);
        toast.success("Invitation canceled");
      } catch {
        toast.error("Could not cancel — it may have already been accepted or canceled.");
      }
    });

  return (
    <div className="space-y-3">
      <div className="text-base font-medium">{row.email}</div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">Role</span>
        <span className="text-sm">{row.role}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">Status</span>
        <Badge variant={displayStatus === "pending" ? "default" : "secondary"}>{displayStatus}</Badge>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">Expires</span>
        <span className="text-muted-foreground text-sm">{new Date(row.expiresAt).toLocaleDateString()}</span>
      </div>
      {(row.status === "pending" || expired) && (
        <div className="flex items-center justify-between gap-3 pt-2">
          {expired ? (
            <Button variant="outline" size="sm" disabled={pending} onClick={onResend} className="w-full">Resend</Button>
          ) : (
            <Button variant="ghost" size="sm" disabled={pending} onClick={onCancel} className="w-full">Cancel</Button>
          )}
        </div>
      )}
    </div>
  );
}
