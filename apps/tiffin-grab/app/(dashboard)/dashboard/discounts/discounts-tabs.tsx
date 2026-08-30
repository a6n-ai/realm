import { HistoryIcon, PercentIcon, SlidersHorizontalIcon, TicketPercentIcon } from "lucide-react";
import { RoutedTabNav } from "@realm/design-system";

const SUBTABS = [
  { label: "Logs", href: "/dashboard/discounts/logs", icon: HistoryIcon },
  { label: "Coupons", href: "/dashboard/discounts/coupons", icon: TicketPercentIcon },
  { label: "Rep allowance", href: "/dashboard/discounts/rep-allowance", icon: PercentIcon },
  { label: "Enabled kinds", href: "/dashboard/discounts/kinds", icon: SlidersHorizontalIcon },
] as const;

export function DiscountsTabs() {
  return <RoutedTabNav tabs={SUBTABS} ariaLabel="Discount settings" />;
}
