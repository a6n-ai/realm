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
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
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
    <Tabs value={active}>
      <TabsList variant="line" aria-label="Analytics sections" className="max-w-full overflow-x-auto">
        {SUBTABS.map((t) => (
          <TabsTrigger key={t.href} value={t.href} asChild>
            <Link href={qs ? `${t.href}?${qs}` : t.href} prefetch={false}>
              <t.icon aria-hidden />
              {t.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
