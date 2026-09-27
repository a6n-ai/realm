"use client";

import {
  BarChart3Icon,
  CalendarClockIcon,
  CoinsIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  MapPinnedIcon,
  TargetIcon,
  TrendingUpIcon,
  UsersIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { RoutedTabNav } from "@foundry/design-system";

const SUBTABS = [
  { label: "Overview", href: "/dashboard/analytics/overview", icon: LayoutDashboardIcon },
  { label: "Leads", href: "/dashboard/analytics/leads", icon: TargetIcon },
  { label: "Revenue", href: "/dashboard/analytics/revenue", icon: CoinsIcon },
  { label: "Profitability", href: "/dashboard/analytics/profitability", icon: TrendingUpIcon },
  { label: "Products & Menu", href: "/dashboard/analytics/products", icon: UtensilsCrossedIcon },
  { label: "Customers", href: "/dashboard/analytics/customers", icon: UsersIcon },
  { label: "Renewals", href: "/dashboard/analytics/renewals", icon: CalendarClockIcon },
  { label: "Operations", href: "/dashboard/analytics/operations", icon: MapPinnedIcon },
  { label: "Complaints", href: "/dashboard/analytics/complaints", icon: LifeBuoyIcon },
  { label: "Employees", href: "/dashboard/analytics/employees", icon: BarChart3Icon },
] as const;

export function AnalyticsTabs() {
  return <RoutedTabNav tabs={SUBTABS} ariaLabel="Analytics sections" />;
}
