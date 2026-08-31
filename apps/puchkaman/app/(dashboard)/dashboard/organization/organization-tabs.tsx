"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Building2Icon, UsersIcon } from "lucide-react";
import { PageHeader, RoutedTabNav } from "@foundry/design-system";

// "Users" points at the existing staff/user management page — puchkaman
// already has one at /dashboard/settings/users, so this tab reuses it rather
// than standing up a duplicate /dashboard/organization/users page.
const TABS = [
  {
    id: "users",
    label: "Users",
    href: "/dashboard/settings/users",
    icon: UsersIcon,
    subtitle: "Accounts that can sign in to this dashboard. Clover Register staff are managed separately under Employees.",
  },
  {
    id: "clients",
    label: "Clients",
    href: "/dashboard/organization/clients",
    icon: Building2Icon,
    subtitle: "Brands and their franchises.",
  },
] as const;

function activeTab(pathname: string) {
  return TABS.find((t) => pathname.startsWith(t.href)) ?? TABS[1];
}

export function OrganizationTabs() {
  return <RoutedTabNav tabs={TABS} ariaLabel="Organization sections" />;
}

// Shared header for both organization tabs (Users, Clients) so the two pages
// stay visually identical — same icon/title/subtitle placement, same order
// relative to the tab bar — and only their section content differs.
export function OrganizationHeader({ actions }: { actions?: ReactNode }) {
  const pathname = usePathname();
  const tab = activeTab(pathname);
  return <PageHeader icon={tab.icon} title={tab.label} subtitle={tab.subtitle} actions={actions} />;
}
