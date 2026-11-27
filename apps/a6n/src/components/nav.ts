import type { NavGroup, NavItem } from "@foundry/console/nav";
import { InboxIcon, SettingsIcon, TagIcon, UserRoundXIcon } from "lucide-react";
import { allows, type Role } from "../lib/auth/permissions";

export type CreateKind = "inquiry" | "invite" | "source";
export type CreateItem = { kind: CreateKind; label: string };

export function visibleNav(role: Role, unassigned: { total: number; overdue: number }): NavGroup[] {
  const badge = unassigned.total > 0 ? String(unassigned.total) : undefined;
  const admin: NavItem[] = allows(role, "source:manage") ? [{ label: "Sources", to: "/sources", icon: TagIcon }] : [];
  return [
    {
      items: [
        { label: "Inquiries", to: "/inquiries", icon: InboxIcon },
        { label: "Unassigned", to: "/inquiries?view=unassigned", icon: UserRoundXIcon, ...(badge ? { badge } : {}) },
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
