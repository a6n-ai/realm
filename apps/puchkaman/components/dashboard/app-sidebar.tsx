"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BanknoteIcon,
  BookOpenIcon,
  CreditCardIcon,
  FolderTreeIcon,
  LayoutDashboardIcon,
  LayersIcon,
  LogOutIcon,
  PackageIcon,
  PercentIcon,
  PuzzleIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
  UtensilsCrossedIcon,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/lib/auth/client";
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
  SidebarRail,
} from "@realm/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@realm/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@realm/ui/avatar";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};
export type NavSection = { label: string; items: NavItem[] };

const COMMERCE_ITEMS: NavItem[] = [
  { title: "Products", href: "/dashboard/products", icon: UtensilsCrossedIcon },
  { title: "Orders", href: "/dashboard/orders", icon: PackageIcon },
  { title: "Finance", href: "/dashboard/finance", icon: BanknoteIcon },
];

const CLOVER_CATALOG_ITEMS: NavItem[] = [
  { title: "Categories", href: "/dashboard/clover/categories", icon: FolderTreeIcon },
  {
    title: "Modifier groups",
    href: "/dashboard/clover/modifier-groups",
    icon: LayersIcon,
  },
  { title: "Menus", href: "/dashboard/clover/menus", icon: BookOpenIcon },
  { title: "Discounts", href: "/dashboard/clover/discounts", icon: PercentIcon },
  { title: "Employees", href: "/dashboard/clover/employees", icon: UsersIcon },
];

/**
 * Build sidebar/more-drawer sections.
 * When Clover is installed, Products / Orders / Finance live under the Clover
 * group (puchkaman commerce is Clover-centric). Catalog tools + Connection
 * join that group. Before install, commerce stays under Operations.
 */
export function getNavSections(opts: {
  cloverInstalled: boolean;
  /** Reserved — connection status no longer drives nav badges. */
  cloverConnected?: boolean;
}): NavSection[] {
  const sections: NavSection[] = [
    {
      label: "Overview",
      items: [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon }],
    },
  ];

  if (opts.cloverInstalled) {
    sections.push({
      label: "Clover",
      items: [
        ...COMMERCE_ITEMS,
        ...CLOVER_CATALOG_ITEMS,
        {
          title: "Connection",
          href: "/dashboard/settings/clover",
          icon: CreditCardIcon,
        },
      ],
    });
  } else {
    sections.push({
      label: "Operations",
      items: COMMERCE_ITEMS,
    });
  }

  sections.push({
    label: "Administration",
    items: [
      { title: "Settings", href: "/dashboard/settings", icon: SettingsIcon },
      { title: "Integrations", href: "/dashboard/settings/integrations", icon: PuzzleIcon },
      { title: "Account", href: "/dashboard/account", icon: UserIcon },
    ],
  });

  return sections;
}

/** @deprecated Prefer getNavSections — kept for any static consumers. */
export const SECTIONS: NavSection[] = getNavSections({
  cloverInstalled: false,
  cloverConnected: false,
});

export function AppSidebar({
  user,
  cloverInstalled = false,
  cloverConnected = false,
}: {
  user: { email: string; name?: string | null };
  cloverInstalled?: boolean;
  cloverConnected?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const label = user.name?.trim() || user.email;
  const initials = label.slice(0, 2).toUpperCase();
  const sections = getNavSections({ cloverInstalled, cloverConnected });
  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === href;
    // Avoid Settings lighting up while on Connection (/dashboard/settings/clover).
    if (href === "/dashboard/settings") {
      return pathname === href || pathname === "/dashboard/settings/";
    }
    return pathname.startsWith(href);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/dashboard" className="group flex items-center gap-2 px-2 py-1.5">
          <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
            <UtensilsCrossedIcon className="size-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">Puchkaman</span>
            <span className="text-muted-foreground text-xs">Operations</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarMenu>
              {section.items.map((item) => (
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
        ))}
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
                    <span className="truncate text-sm font-medium">{label}</span>
                    <span className="text-muted-foreground text-xs capitalize">admin</span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-56">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="truncate font-medium">{label}</span>
                  <span className="text-muted-foreground truncate text-xs font-normal">
                    {user.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/account">
                      <UserIcon data-icon="inline-start" />
                      Account
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/settings">
                      <SettingsIcon data-icon="inline-start" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    void signOut({
                      fetchOptions: {
                        onSuccess: () => {
                          router.push("/login");
                        },
                      },
                    })
                  }
                >
                  <LogOutIcon data-icon="inline-start" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
