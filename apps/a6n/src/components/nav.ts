import type { NavGroup, NavItem } from "@foundry/console/nav";
import { InboxIcon, SettingsIcon, TagIcon, UserRoundXIcon, UsersIcon } from "lucide-react";
import { allows, type Role } from "../lib/auth/permissions";

export type CreateKind = "inquiry" | "invite" | "source";
export type CreateItem = { kind: CreateKind; label: string };

export function visibleNav(role: Role, unassigned: { total: number; overdue: number }): NavGroup[] {
  const badge = unassigned.overdue > 0 ? `${unassigned.total} · ${unassigned.overdue} overdue` : String(unassigned.total);
  const admin: NavItem[] = [
    ...(allows(role, "source:manage") ? [{ label: "Sources", to: "/sources", icon: TagIcon }] : []),
    ...(allows(role, "team:manage") ? [{ label: "Team", to: "/settings/members", icon: UsersIcon }] : []),
  ];
  return [
    {
      items: [
        { label: "Inquiries", to: "/inquiries", icon: InboxIcon },
        { label: "Unassigned", to: "/inquiries?view=unassigned", icon: UserRoundXIcon, badge },
      ],
    },
    { items: [...admin, { label: "Settings", to: "/settings", icon: SettingsIcon }] },
  ];
}

export function createItems(role: Role): CreateItem[] {
  return [
    ...(allows(role, "inquiry:create") ? [{ kind: "inquiry" as const, label: "New inquiry" }] : []),
    ...(allows(role, "team:manage") ? [{ kind: "invite" as const, label: "Invite member" }] : []),
    ...(allows(role, "source:manage") ? [{ kind: "source" as const, label: "New source" }] : []),
  ];
}
