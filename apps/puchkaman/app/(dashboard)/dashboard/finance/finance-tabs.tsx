"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCardIcon, ScrollTextIcon, type LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@realm/ui/tabs";

type SubTab = { label: string; href: string; icon: LucideIcon };

const SUBTABS: SubTab[] = [
  { label: "Transactions", href: "/dashboard/finance/transactions", icon: CreditCardIcon },
  { label: "Ledger", href: "/dashboard/finance/ledger", icon: ScrollTextIcon },
];

/** Routed sub-tabs — active derived from pathname (tiffin wallet pattern). */
export function FinanceTabs() {
  const pathname = usePathname();
  const active =
    SUBTABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href ?? "";

  return (
    <Tabs value={active}>
      <TabsList aria-label="Finance sections">
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
