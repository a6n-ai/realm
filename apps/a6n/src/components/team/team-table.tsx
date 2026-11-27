import { ResourceTable, type Column } from "@foundry/console/resource-table";
import type { RowAction } from "@foundry/console/row-menu";
import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
import { Badge } from "@foundry/ui/badge";
import { initials } from "@foundry/ui/initials";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { LocalTime } from "../local-time";
import { errorText } from "../../lib/error-copy";
import type { MemberRow } from "../../lib/team/service";
import { changeRoleFn, resendInviteFn } from "../../lib/team/team.fns";
import { RoleSelect, roleLabel, type RoleOption } from "./role-select";
import type { InviteStatus } from "../../lib/mail/mailer";
import { EmptyState } from "../page/empty-state";
import { Panel } from "../page/panel";
import { copyLink } from "./invite-dialog";
import { InviteStatusBadge } from "./invite-status";
import { ReportsToDialog } from "./reports-to-dialog";
import { RemoveMemberDialog } from "./remove-member-dialog";

export type TeamMember = MemberRow & { inviteLink: string | null };

const columns = (statuses: Record<string, InviteStatus>, role: (m: TeamMember) => ReactNode): Column<TeamMember>[] => [
  {
    header: "Member",
    cell: (m) => (
      <span className="flex items-center gap-3">
        <Avatar size="sm">
          <AvatarFallback>{initials(m.name)}</AvatarFallback>
        </Avatar>
        <span className="grid">
          <span className="font-medium text-(--strong)">{m.name}</span>
          <span className="text-muted-foreground">{m.email}</span>
        </span>
      </span>
    ),
  },
  { header: "Role", secondary: true, cell: role },
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
  { header: "Last sign-in", secondary: true, cell: (m) => (m.lastSignIn === null ? "—" : <LocalTime at={m.lastSignIn} />) },
  { header: "Open inquiries", numeric: true, secondary: true, cell: (m) => m.openInquiries },
];

export function TeamTable({
  members,
  statuses,
  selfId,
  roles,
  canChangeRoles,
  canRemove,
  canSetManager,
  everyone,
  filtered = false,
}: {
  members: TeamMember[];
  statuses: Record<string, InviteStatus>;
  selfId: string;
  roles: RoleOption[];
  canChangeRoles: boolean;
  canRemove: boolean;
  canSetManager: boolean;
  everyone: TeamMember[];
  filtered?: boolean;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [reporting, setReporting] = useState<TeamMember | null>(null);

  async function resend(m: TeamMember) {
    try {
      const res = await resendInviteFn({ data: { id: m.id } });
      if (!res.ok) return void toast.error(errorText(new Error(res.code)));
      if (res.sent) toast.success("Invite sent");
      else toast.error(res.reason ? errorText(new Error(res.reason)) : "The invite could not be sent. Copy the link and send it another way.");
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  async function changeRole(m: TeamMember, role: string) {
    if (role === m.role) return;
    try {
      const res = await changeRoleFn({ data: { id: m.id, role } });
      if (!res.ok) return void toast.error(errorText(new Error(res.code)));
      toast.success(`${m.name} is now ${roleLabel(role)}`);
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  const roleCell = (m: TeamMember) =>
    canChangeRoles && m.status === "active" ? (
      <RoleSelect value={m.role} roles={roles} onChange={(r) => void changeRole(m, r)} label={`Role for ${m.name}`} />
    ) : (
      <Badge variant="outline">{roleLabel(m.role)}</Badge>
    );

  const menu = (m: TeamMember): RowAction[] => {
    const active = m.status === "active";
    return [
      { label: "Resend invite", onSelect: () => void resend(m), hidden: !active || m.passwordSet },
      { label: "Copy link", onSelect: () => void copyLink(m.inviteLink!), hidden: !m.inviteLink },
      { label: "Reports to", onSelect: () => setReporting(m), hidden: !canSetManager || !active },
      { label: "Remove", destructive: true, onSelect: () => setRemoving(m), hidden: !canRemove || !active || m.id === selfId },
    ];
  };

  return (
    <>
      <Panel>
        <ResourceTable
          label="Members"
          columns={columns(statuses, roleCell)}
          rows={members}
          rowKey={(m) => m.id}
          rowLabel={(m) => m.name}
          menu={menu}
          empty={
            <EmptyState
              icon={UsersIcon}
              title={filtered ? "No members match" : "No team members yet"}
              description={filtered ? "Try a different search or clear the filters." : "Invite someone above to start sharing inquiries."}
            />
          }
        />
      </Panel>
      <RemoveMemberDialog member={removing} onClose={() => setRemoving(null)} />
      {reporting ? <ReportsToDialog member={reporting} people={everyone.filter((p) => p.status === "active")} onClose={() => setReporting(null)} /> : null}
    </>
  );
}
