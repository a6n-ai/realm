"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HistoryIcon, PercentIcon, SlidersHorizontalIcon, TicketPercentIcon, type LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@realm/ui/tabs";

type SubTab = { label: string; href: string; icon: LucideIcon };

const SUBTABS: SubTab[] = [
  { label: "Logs", href: "/dashboard/discounts/logs", icon: HistoryIcon },
  { label: "Coupons", href: "/dashboard/discounts/coupons", icon: TicketPercentIcon },
  { label: "Rep allowance", href: "/dashboard/discounts/rep-allowance", icon: PercentIcon },
  { label: "Enabled kinds", href: "/dashboard/discounts/kinds", icon: SlidersHorizontalIcon },
];

// Routed sub-tabs styled with the shared shadcn Tabs. Each trigger is a real
// Link (asChild) so every sub-section keeps its own URL; the active tab is
// derived from the pathname rather than local Tabs state.
export function DiscountsTabs() {
  const pathname = usePathname();
  const active = SUBTABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href ?? "";

  return (
    <Tabs value={active}>
      <TabsList aria-label="Discount settings">
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
