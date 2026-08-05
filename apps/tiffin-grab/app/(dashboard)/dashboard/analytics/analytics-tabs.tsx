"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3Icon,
  CoinsIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  MapPinnedIcon,
  TargetIcon,
  UsersIcon,
  UtensilsCrossedIcon,
  type LucideIcon,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@realm/ui/tabs";

type SubTab = { label: string; href: string; icon: LucideIcon };

const SUBTABS: SubTab[] = [
  { label: "Overview", href: "/dashboard/analytics/overview", icon: LayoutDashboardIcon },
  { label: "Leads", href: "/dashboard/analytics/leads", icon: TargetIcon },
  { label: "Revenue", href: "/dashboard/analytics/revenue", icon: CoinsIcon },
  { label: "Products & Menu", href: "/dashboard/analytics/products", icon: UtensilsCrossedIcon },
  { label: "Customers", href: "/dashboard/analytics/customers", icon: UsersIcon },
  { label: "Operations", href: "/dashboard/analytics/operations", icon: MapPinnedIcon },
  { label: "Complaints", href: "/dashboard/analytics/complaints", icon: LifeBuoyIcon },
  { label: "Employees", href: "/dashboard/analytics/employees", icon: BarChart3Icon },
];

// Same routed-sub-tabs pattern as DiscountsTabs: each trigger is a real Link
// so every sub-section keeps its own URL; active tab derives from pathname.
export function AnalyticsTabs() {
  const pathname = usePathname();
  const active = SUBTABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href ?? "";

  return (
    <Tabs value={active}>
      <TabsList aria-label="Analytics sections" className="h-auto flex-wrap">
        {SUBTABS.map((tab) => (
          <TabsTrigger key={tab.href} value={tab.href} asChild>
            <Link href={tab.href}>
              <tab.icon />
              {tab.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
