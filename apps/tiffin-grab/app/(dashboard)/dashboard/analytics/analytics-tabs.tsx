"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3Icon,
  CoinsIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  MapPinnedIcon,
  TargetIcon,
  TrendingUpIcon,
  UsersIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { cn } from "@foundry/ui/cn";
import { ANALYTICS_FILTER_PARAMS } from "@/lib/services/analytics/shared-filter-params";

const SUBTABS = [
  { label: "Overview", href: "/dashboard/analytics/overview", icon: LayoutDashboardIcon },
  { label: "Leads", href: "/dashboard/analytics/leads", icon: TargetIcon },
  { label: "Revenue", href: "/dashboard/analytics/revenue", icon: CoinsIcon },
  { label: "Profitability", href: "/dashboard/analytics/profitability", icon: TrendingUpIcon },
  { label: "Products & Menu", href: "/dashboard/analytics/products", icon: UtensilsCrossedIcon },
  { label: "Customers", href: "/dashboard/analytics/customers", icon: UsersIcon },
  { label: "Operations", href: "/dashboard/analytics/operations", icon: MapPinnedIcon },
  { label: "Complaints", href: "/dashboard/analytics/complaints", icon: LifeBuoyIcon },
  { label: "Employees", href: "/dashboard/analytics/employees", icon: BarChart3Icon },
] as const;

/** Carry only the shared analytics filters across section switches. */
function sharedQuery(params: URLSearchParams): string {
  const sp = new URLSearchParams();
  for (const key of ANALYTICS_FILTER_PARAMS) {
    const v = params.get(key);
    if (v) sp.set(key, v);
  }
  return sp.toString();
}

export function AnalyticsTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const qs = sharedQuery(params);
  const active =
    SUBTABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href ?? SUBTABS[0]?.href;

  return (
    <nav
      aria-label="Analytics sections"
      className="bg-card -mx-1 flex gap-1 overflow-x-auto rounded-xl p-1.5 shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
    >
      {SUBTABS.map((t) => {
        const href = qs ? `${t.href}?${qs}` : t.href;
        const isActive = t.href === active;
        return (
          <Link
            key={t.href}
            href={href}
            prefetch={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <t.icon className="size-[18px] shrink-0" aria-hidden />
            <span className="whitespace-nowrap">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
