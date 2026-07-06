"use client";
import { usePathname } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { BottomNav, type BottomNavFab } from "@realm/design-system";
import { SECTIONS } from "./app-sidebar";

// 4 primary destinations by role, drawn from the same SECTIONS source as the sidebar.
const STAFF_TABS = ["/dashboard", "/dashboard/inquiries", "/dashboard/orders", "/dashboard/customers"];
const CUSTOMER_TABS = ["/dashboard", "/dashboard/meals", "/dashboard/support", "/dashboard/account"];

// Per-route context create → deep-links the list page with ?new=1 (the sheet opens on it).
const FAB_BY_ROUTE: Record<string, { label: string }> = {
  "/dashboard/orders": { label: "New order" },
  "/dashboard/inquiries": { label: "New inquiry" },
  "/dashboard/customers": { label: "New customer" },
};

export function AppBottomNav({ role }: { role: string }) {
  const pathname = usePathname();
  const allItems = SECTIONS.flatMap((s) => s.items);
  const wanted = role === "admin" || role === "member" ? STAFF_TABS : CUSTOMER_TABS;
  const items = wanted
    .map((href) => allItems.find((i) => i.href === href))
    .filter((i): i is NonNullable<typeof i> => !!i && i.roles.includes(role))
    .map((i) => ({
      title: i.title,
      href: i.href,
      icon: i.icon,
      active: i.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(i.href),
    }));
  const fabDef = FAB_BY_ROUTE[pathname];
  const fab: BottomNavFab | undefined = fabDef
    ? { label: fabDef.label, icon: PlusIcon, href: `${pathname}?new=1` }
    : undefined;
  return <BottomNav items={items} fab={fab} />;
}
