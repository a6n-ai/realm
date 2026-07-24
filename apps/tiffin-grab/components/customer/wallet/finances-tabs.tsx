"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CoinsIcon, ReceiptIcon, ScrollTextIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@realm/ui/tabs";
import type { FinancesTab } from "./finances-tab";

const TABS: { id: FinancesTab; label: string; icon: typeof CoinsIcon }[] = [
  { id: "coins", label: "Coins", icon: CoinsIcon },
  { id: "bills", label: "Bills", icon: ReceiptIcon },
  { id: "transactions", label: "Transactions", icon: ScrollTextIcon },
];

function tabHref(id: FinancesTab): string {
  return id === "coins" ? "/me/wallet" : `/me/wallet?tab=${id}`;
}

export function FinancesTabs({ active }: { active: FinancesTab }) {
  const router = useRouter();

  return (
    <Tabs
      value={active}
      onValueChange={(v) => {
        router.push(tabHref(v as FinancesTab));
      }}
    >
      <TabsList aria-label="Finances sections" className="md:h-10">
        {TABS.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} asChild className="md:px-4">
            <Link href={tabHref(tab.id)}>
              <tab.icon />
              {tab.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
