"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SettingsIcon,
  TicketPercentIcon,
  UsersIcon,
  UtensilsCrossedIcon,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = { label: string; href: string; icon: LucideIcon };

const TABS: Tab[] = [
  { label: "General", href: "/dashboard/settings/general", icon: SettingsIcon },
  { label: "Lead sources", href: "/dashboard/settings/lead-sources", icon: Webhook },
  { label: "Lead assignment", href: "/dashboard/settings/lead-assignment", icon: UsersIcon },
  { label: "Meal types", href: "/dashboard/settings/meal-types", icon: UtensilsCrossedIcon },
  { label: "Discounts", href: "/dashboard/settings/discounts", icon: TicketPercentIcon },
];

// Routed top-tabs for the settings shell. usePathname drives the active state so
// each section keeps its own URL (the tabs are real links, not client-state tabs).
// A tab is active when the path equals its href or sits beneath it (so Discounts
// stays lit across its nested coupons / rep-allowance / kinds sub-routes).
export function SettingsTabs() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Settings sections" className="border-border/60 -mb-px border-b">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap",
                  "ring-offset-background transition-[color,background-color,transform] outline-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <tab.icon className="size-4 shrink-0" aria-hidden />
                {tab.label}
                <span
                  aria-hidden
                  className={cn(
                    "bg-primary pointer-events-none absolute inset-x-3 bottom-0 h-0.5 origin-left rounded-full transition-[opacity,transform] duration-200 ease-out",
                    active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
