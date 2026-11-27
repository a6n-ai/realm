import { EmptyState } from "@foundry/console/empty-state";
import { ResourceTable, type Column } from "@foundry/console/resource-table";
import type { RowAction } from "@foundry/console/row-menu";
import { Badge } from "@foundry/ui/badge";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { useState } from "react";
import { errorText } from "../../lib/error-copy";
import type { MemberRow } from "../../lib/team/service";
import { resendInviteFn } from "../../lib/team/team.fns";
import type { InviteStatus } from "../../lib/mail/mailer";
import { copyLink, InviteDialog } from "./invite-dialog";
import { InviteStatusBadge } from "./invite-status";
import { RemoveMemberDialog } from "./remove-member-dialog";

export type TeamMember = MemberRow & { inviteLink: string };

const columns = (statuses: Record<string, InviteStatus>): Column<TeamMember>[] => [
  {
    header: "Member",
    cell: (m) => (
      <span className="grid">
        <span className="font-medium text-(--strong)">{m.name}</span>
        <span className="text-muted-foreground">{m.email}</span>
      </span>
    ),
  },
  { header: "Role", secondary: true, cell: (m) => <span className="capitalize">{m.role}</span> },
  {
    header: "Status",
    cell: (m) =>
      m.status === "active" ? (
        <Badge variant={m.passwordSet ? "success" : "info"}>{m.passwordSet ? "Active" : "Invited"}</Badge>
      ) : (
        <Badge variant="neutral">Removed</Badge>
      ),
  },
  { header: "Invite", secondary: true, cell: (m) => <InviteStatusBadge hasInvite={m.latestInvite !== null} status={statuses[m.id]} /> },
  { header: "Open inquiries", numeric: true, secondary: true, cell: (m) => m.openInquiries },
];

export function TeamTable({ members, statuses, selfId }: { members: TeamMember[]; statuses: Record<string, InviteStatus>; selfId: string }) {
  const router = useRouter();
  const [removing, setRemoving] = useState<TeamMember | null>(null);

  async function resend(m: TeamMember) {
    try {
      const res = await resendInviteFn({ data: { id: m.id } });
      if (!res.ok) return void toast.error(errorText(new Error(res.code)));
      if (res.sent) toast.success("Invite sent");
      else toast.error("The invite could not be sent. Copy the link and send it another way.");
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  const menu = (m: TeamMember): RowAction[] => {
    const active = m.status === "active";
    return [
      { label: "Resend invite", onSelect: () => void resend(m), hidden: !active || m.passwordSet },
      { label: "Copy invite link", onSelect: () => void copyLink(m.inviteLink), hidden: !active || m.passwordSet },
      { label: "Remove", destructive: true, onSelect: () => setRemoving(m), hidden: !active || m.id === selfId },
    ];
  };

  return (
    <>
      <ResourceTable
        label="Team"
        columns={columns(statuses)}
        rows={members}
        rowKey={(m) => m.id}
        rowLabel={(m) => m.name}
        menu={menu}
        empty={<EmptyState icon={UsersIcon} title="No team members yet" description="Invite someone to start sharing inquiries." action={<InviteDialog />} />}
      />
      <RemoveMemberDialog member={removing} onClose={() => setRemoving(null)} />
    </>
  );
}
