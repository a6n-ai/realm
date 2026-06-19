"use client";

import {
  CalendarIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  type LucideIcon,
  SaladIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type NavItem = { title: string; href: string; icon: LucideIcon; roles: string[] };

const NAV: NavItem[] = [
  { title: "Overview", href: "/dashboard", icon: LayoutDashboardIcon, roles: ["admin", "member"] },
  { title: "Inquiries", href: "/dashboard/inquiries", icon: ClipboardListIcon, roles: ["admin", "member"] },
  { title: "Catalog", href: "/dashboard/catalog", icon: UtensilsCrossedIcon, roles: ["admin"] },
  { title: "Dishes", href: "/dashboard/dishes", icon: SaladIcon, roles: ["admin"] },
  { title: "Weekly Menus", href: "/dashboard/menus", icon: CalendarIcon, roles: ["admin"] },
  { title: "Meal slots", href: "/dashboard/settings/meal-slots", icon: SettingsIcon, roles: ["admin"] },
  { title: "Users", href: "/dashboard/users", icon: UsersIcon, roles: ["admin"] },
  { title: "My meals", href: "/dashboard/meals", icon: UtensilsCrossedIcon, roles: ["user"] },
  { title: "Account", href: "/dashboard/account", icon: UserIcon, roles: ["admin", "member", "user"] },
];

export function AppSidebar({ user }: { user: { email: string; role: string } }) {
  const pathname = usePathname();
  const initials = user.email.slice(0, 2).toUpperCase();

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/dashboard" className="flex items-center gap-2 px-2 py-1.5">
          <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
            <UtensilsCrossedIcon className="size-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Tiffin Grab</span>
            <span className="text-muted-foreground text-xs">Operations</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            {NAV.filter((item) => item.roles.includes(user.role)).map((item) => {
              const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <Avatar className="size-8 rounded-md">
                    <AvatarFallback className="rounded-md">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col leading-tight">
                    <span className="truncate text-sm font-medium">{user.email}</span>
                    <span className="text-muted-foreground text-xs capitalize">{user.role}</span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-56">
                <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
                    <LogOutIcon data-icon="inline-start" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
