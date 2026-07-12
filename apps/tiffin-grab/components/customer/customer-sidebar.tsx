"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDaysIcon, HomeIcon, LogOutIcon, UserIcon, UtensilsCrossedIcon } from "lucide-react";
import { signOut } from "@/lib/auth/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@realm/ui/sidebar";

const NAV = [
  { title: "Home", href: "/me", icon: HomeIcon },
  { title: "Deliveries", href: "/me/deliveries", icon: CalendarDaysIcon },
  { title: "Profile", href: "/me/profile", icon: UserIcon },
] as const;

export function CustomerSidebar({ user }: { user: { name: string | null; email: string; image: string | null } }) {
  const pathname = usePathname();
  const router = useRouter();
  // "/me" must match exactly — startsWith would also light it on /me/deliveries.
  const isActive = (href: string) => (href === "/me" ? pathname === href : pathname.startsWith(href));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/me" className="group flex items-center gap-2 px-2 py-1.5">
          <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
            <UtensilsCrossedIcon className="size-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">Tiffin Grab</span>
            <span className="text-muted-foreground text-xs">Meals</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {NAV.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sign out"
              onClick={async () => { await signOut(); router.push("/login"); }}
            >
              <LogOutIcon />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
