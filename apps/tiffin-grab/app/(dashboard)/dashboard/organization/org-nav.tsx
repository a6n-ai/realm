"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboardIcon, MailIcon, SettingsIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";

const ITEMS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Overview", href: "/dashboard/organization/overview", icon: LayoutDashboardIcon },
  { label: "Members", href: "/dashboard/organization/members", icon: UsersIcon },
  { label: "Invites", href: "/dashboard/organization/invites", icon: MailIcon },
  { label: "Settings", href: "/dashboard/organization/settings", icon: SettingsIcon },
];

export function OrgNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b pb-2 sm:w-48 sm:flex-col sm:border-b-0 sm:border-r sm:pr-4 sm:pb-0">
      {ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
