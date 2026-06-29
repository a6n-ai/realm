"use client";

import * as React from "react";
import {
  BellIcon,
  CalendarIcon,
  CheckIcon,
  ClipboardListIcon,
  CoinsIcon,
  CopyIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  LockIcon,
  LogOutIcon,
  type LucideIcon,
  PackageIcon,
  PaletteIcon,
  SaladIcon,
  SettingsIcon,
  TicketPercentIcon,
  UserIcon,
  UsersIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { signOut } from "@/lib/auth/client";
import { lockSession } from "@/lib/auth/lock-actions";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type NavItem = { title: string; href: string; icon: LucideIcon; roles: string[] };
export type NavSection = { label: string; items: NavItem[] };

// Grouped navigation. A section renders only when the current user's role
// matches at least one of its items. Exported so the command palette reuses it.
export const SECTIONS: NavSection[] = [
  {
    label: "Operations",
    items: [
      { title: "Overview", href: "/dashboard", icon: LayoutDashboardIcon, roles: ["admin", "member"] },
      { title: "Inquiries", href: "/dashboard/inquiries", icon: ClipboardListIcon, roles: ["admin", "member"] },
      { title: "Orders", href: "/dashboard/orders", icon: PackageIcon, roles: ["admin", "member"] },
      { title: "Customers", href: "/dashboard/customers", icon: UsersIcon, roles: ["admin", "member"] },
      { title: "Tickets", href: "/dashboard/tickets", icon: LifeBuoyIcon, roles: ["admin", "member"] },
    ],
  },
  {
    label: "Catalog",
    items: [
      { title: "Catalog", href: "/dashboard/catalog", icon: UtensilsCrossedIcon, roles: ["admin"] },
      { title: "Dishes", href: "/dashboard/dishes", icon: SaladIcon, roles: ["admin"] },
      { title: "Weekly Menus", href: "/dashboard/menus", icon: CalendarIcon, roles: ["admin"] },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Wallet", href: "/dashboard/settings/wallet", icon: CoinsIcon, roles: ["admin"] },
      { title: "Discounts", href: "/dashboard/settings/discounts", icon: TicketPercentIcon, roles: ["admin"] },
    ],
  },
  {
    label: "Engagement",
    items: [
      { title: "Notifications", href: "/dashboard/notifications", icon: BellIcon, roles: ["admin"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Users", href: "/dashboard/users", icon: UsersIcon, roles: ["admin"] },
      { title: "Settings", href: "/dashboard/settings", icon: SettingsIcon, roles: ["admin"] },
      { title: "Design system", href: "/dashboard/design", icon: PaletteIcon, roles: ["admin"] },
    ],
  },
  {
    label: "Personal",
    items: [
      { title: "My meals", href: "/dashboard/meals", icon: UtensilsCrossedIcon, roles: ["user"] },
      { title: "Support", href: "/dashboard/support", icon: LifeBuoyIcon, roles: ["user"] },
      { title: "Account", href: "/dashboard/account", icon: UserIcon, roles: ["admin", "member", "user"] },
    ],
  },
];

// Serializable rep-coupon projection (mirrors RepCouponToday) — kept local so the
// client bundle never imports the server-only coupons service module.
export type RepCouponView = {
  code: string;
  used: number;
  total: number;
  capPct: number | null;
  capAmount: number | null;
};

export function AppSidebar({
  user,
  hasPin,
  repCoupon,
}: {
  user: { email: string; role: string; name: string | null; image: string | null };
  hasPin: boolean;
  repCoupon?: RepCouponView | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const initials = (user.name?.trim() || user.email).slice(0, 2).toUpperCase();
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/dashboard" className="group flex items-center gap-2 px-2 py-1.5">
          <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
            <UtensilsCrossedIcon className="icon-pop size-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">Tiffin Grab</span>
            <span className="text-muted-foreground text-xs">Operations</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {SECTIONS.map((section) => {
          const items = section.items.filter((item) => item.roles.includes(user.role));
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={section.label}>
              <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={item.title}
                      className="group/nav"
                    >
                      <Link href={item.href}>
                        <item.icon className="transition-transform duration-200 group-hover/nav:scale-110" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      {repCoupon && <RepCouponCard coupon={repCoupon} />}

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <Avatar className="size-8 rounded-md">
                    <AvatarImage src={user.image ?? undefined} alt={user.name ?? user.email} className="rounded-md" />
                    <AvatarFallback className="rounded-md">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col leading-tight">
                    <span className="truncate text-sm font-medium">{user.name?.trim() || user.email}</span>
                    <span className="text-muted-foreground text-xs capitalize">{user.role}</span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-56">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="truncate font-medium">{user.name?.trim() || user.email}</span>
                  <span className="text-muted-foreground truncate text-xs font-normal capitalize">{user.role}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/account">
                      <UserIcon data-icon="inline-start" />
                      Account
                    </Link>
                  </DropdownMenuItem>
                  {user.role === "admin" && (
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/settings">
                        <SettingsIcon data-icon="inline-start" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {hasPin && (
                    <DropdownMenuItem
                      onClick={async () => {
                        await lockSession();
                        router.push("/lock");
                      }}
                    >
                      <LockIcon data-icon="inline-start" />
                      Lock session
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ fetchOptions: { onSuccess: () => { router.push("/login"); } } })}>
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

// Compact sidebar card showing the rep's coupon for today: the code with a copy
// button, plus a used/remaining count against their daily budget. Hidden entirely
// when the rail is collapsed to icons (the detail would not fit).
function RepCouponCard({ coupon }: { coupon: RepCouponView }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context / denied) — silently no-op; the
      // code is still visible for manual entry.
    }
  };

  const reached = coupon.used >= coupon.total;
  const ceiling = [
    coupon.capPct != null ? `${coupon.capPct}%` : null,
    coupon.capAmount != null ? `$${coupon.capAmount.toFixed(2)}` : null,
  ].filter(Boolean).join(" / ");

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="gap-1.5">
        <TicketPercentIcon className="size-3.5" aria-hidden />
        Today&apos;s discount coupon
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="bg-sidebar-accent/40 grid gap-2 rounded-lg border p-2.5">
          <div className="flex items-center gap-1.5">
            <code className="bg-background flex-1 break-all rounded-md border px-2 py-1.5 font-mono text-xs tabular-nums">
              {coupon.code}
            </code>
            <button
              type="button"
              onClick={copy}
              aria-label={copied ? "Coupon code copied" : "Copy coupon code"}
              className={cn(
                "text-muted-foreground hover:text-foreground hover:bg-accent flex size-10 shrink-0 items-center justify-center rounded-md border",
                "transition-[transform,color,background-color] duration-150 active:scale-[0.96]",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
              )}
            >
              {copied ? (
                <CheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
              ) : (
                <CopyIcon className="size-4" aria-hidden />
              )}
            </button>
            <span role="status" aria-live="polite" className="sr-only">
              {copied ? "Coupon code copied" : ""}
            </span>
          </div>
          {reached ? (
            <p className="text-muted-foreground text-xs">Daily limit reached</p>
          ) : (
            <p className="text-xs">
              <span className="tabular-nums font-medium">{coupon.used}</span>
              <span className="text-muted-foreground"> of </span>
              <span className="tabular-nums font-medium">{coupon.total}</span>
              <span className="text-muted-foreground"> used today</span>
            </p>
          )}
          {ceiling && (
            <p className="text-muted-foreground text-xs tabular-nums">up to {ceiling}</p>
          )}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
