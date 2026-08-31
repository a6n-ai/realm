"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { InboxIcon, KeyIcon, LayoutDashboardIcon, ScrollTextIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@foundry/ui/sidebar";
import { signOut } from "@/lib/auth/client";
import { Button } from "@foundry/ui/button";

const ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/dashboard/tenants", label: "Tenants", icon: KeyIcon },
  { href: "/dashboard/logs", label: "Outbox", icon: ScrollTextIcon },
  { href: "/dashboard/templates", label: "Templates", icon: InboxIcon },
];

export function RelaySidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3 font-semibold">Relay</SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2 p-3">
        <p className="text-muted-foreground truncate text-xs">{email}</p>
        <Button variant="outline" size="sm" onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/login"; } } })}>
          Sign out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
