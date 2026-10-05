"use client";

import { HistoryIcon, ListIcon, TicketPercentIcon } from "lucide-react";
import { RoutedTabNav } from "@foundry/design-system";

const SUBTABS = [
  { label: "All discounts", href: "/dashboard/catalog/discounts", icon: ListIcon },
  { label: "Coupons", href: "/dashboard/discounts/coupons", icon: TicketPercentIcon },
  { label: "Logs", href: "/dashboard/discounts/logs", icon: HistoryIcon },
] as const;

export function DiscountsTabs() {
  return <RoutedTabNav tabs={SUBTABS} ariaLabel="Discounts" />;
}
