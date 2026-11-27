import type { NavGroup, NavItem } from "@foundry/console/nav";
import { InboxIcon, TagIcon, UserRoundXIcon, UsersIcon } from "lucide-react";
import { allows, type Role } from "../lib/auth/permissions";

export function visibleNav(role: Role, unassigned: { total: number; overdue: number }): NavGroup[] {
  const badge = unassigned.overdue > 0 ? `${unassigned.total} · ${unassigned.overdue} overdue` : String(unassigned.total);
  const admin: NavItem[] = [
    ...(allows(role, "team:manage") ? [{ label: "Team", to: "/team", icon: UsersIcon }] : []),
    ...(allows(role, "source:manage") ? [{ label: "Sources", to: "/sources", icon: TagIcon }] : []),
  ];
  return [
    {
      items: [
        { label: "Inquiries", to: "/inquiries", icon: InboxIcon },
        { label: "Unassigned", to: "/inquiries?view=unassigned", icon: UserRoundXIcon, badge },
      ],
    },
    ...(admin.length > 0 ? [{ label: "Admin", items: admin }] : []),
  ];
}
