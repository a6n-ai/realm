"use client";

import { GiftIcon, HistoryIcon, PercentIcon, SlidersHorizontalIcon, TicketIcon, TicketPercentIcon } from "lucide-react";
import { DatedTabNav } from "@/components/filters/dated-tab-nav";

const SUBTABS = [
  { label: "Logs", href: "/dashboard/discounts/logs", icon: HistoryIcon },
  { label: "Coupons", href: "/dashboard/discounts/coupons", icon: TicketPercentIcon },
  { label: "Rep allowance", href: "/dashboard/discounts/rep-allowance", icon: PercentIcon },
  { label: "Staff codes", href: "/dashboard/discounts/staff-codes", icon: TicketIcon },
  { label: "Referrals", href: "/dashboard/discounts/referrals", icon: GiftIcon },
  { label: "Enabled kinds", href: "/dashboard/discounts/kinds", icon: SlidersHorizontalIcon },
] as const;

export function DiscountsTabs() {
  return <DatedTabNav tabs={SUBTABS} ariaLabel="Discount settings" />;
}
