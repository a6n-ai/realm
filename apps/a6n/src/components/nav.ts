import type { NavGroup, NavItem } from "@foundry/console/nav";
import { BuildingIcon, FileTextIcon, InboxIcon, SettingsIcon, TagIcon, UserRoundXIcon } from "lucide-react";
import type { Permission } from "../lib/auth/permissions";

export type CreateKind = "inquiry" | "invite" | "source";
export type CreateItem = { kind: CreateKind; label: string };

export function visibleNav(permissions: readonly Permission[], unassigned: { total: number; overdue: number }, platformAdmin = false): NavGroup[] {
  const badge = unassigned.total > 0 ? String(unassigned.total) : undefined;
  const admin: NavItem[] = permissions.includes("source:manage") ? [{ label: "Sources", to: "/sources", icon: TagIcon }] : [];
  return [
    {
      items: [
        { label: "Inquiries", to: "/inquiries", icon: InboxIcon },
        { label: "Unassigned", to: "/inquiries?view=unassigned", icon: UserRoundXIcon, ...(badge ? { badge } : {}) },
        { label: "Docs", to: "/docs", icon: FileTextIcon },
      ],
    },
    { items: [...admin, { label: "Settings", to: "/settings", icon: SettingsIcon }] },
    ...(platformAdmin ? [{ items: [{ label: "Organisations", to: "/admin", icon: BuildingIcon }] }] : []),
  ];
}

export function createItems(permissions: readonly Permission[]): CreateItem[] {
  return [
    ...(permissions.includes("inquiry:create") ? [{ kind: "inquiry" as const, label: "New inquiry" }] : []),
    ...(permissions.includes("invitation:create") ? [{ kind: "invite" as const, label: "Invite member" }] : []),
    ...(permissions.includes("source:manage") ? [{ kind: "source" as const, label: "New source" }] : []),
  ];
}
