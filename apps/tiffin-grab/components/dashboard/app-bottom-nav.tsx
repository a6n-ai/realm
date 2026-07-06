"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ClipboardListIcon, LayoutDashboardIcon, MenuIcon, PackageIcon } from "lucide-react";
import { BottomNav, type BottomNavItem } from "@realm/design-system";
import { MoreDrawer } from "./more-drawer";
import { QuickCreateDrawer } from "./quick-create-drawer";

const TABS = [
  { href: "/dashboard", title: "Overview", icon: LayoutDashboardIcon },
  { href: "/dashboard/inquiries", title: "Inquiries", icon: ClipboardListIcon },
  { href: "/dashboard/orders", title: "Orders", icon: PackageIcon },
];

export function AppBottomNav({ role }: { role: string }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const staff = role === "admin" || role === "member";
  if (!staff) return null; // customers use the sidebar/account nav; no bottom bar
  const items: BottomNavItem[] = [
    ...TABS.map((t) => ({
      title: t.title,
      icon: t.icon,
      active: t.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(t.href),
      href: t.href,
    })),
    { title: "More", icon: MenuIcon, active: moreOpen, onClick: () => setMoreOpen(true) },
  ];
  return (
    <>
      <BottomNav items={items} onFabClick={() => setCreateOpen(true)} fabLabel="Create" />
      <MoreDrawer role={role} open={moreOpen} onOpenChange={setMoreOpen} />
      <QuickCreateDrawer role={role} open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
