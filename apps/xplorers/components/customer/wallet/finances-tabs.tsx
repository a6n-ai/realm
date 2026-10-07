"use client";

import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { financesHref, type FinancesTab } from "./finances-tab";

const TABS: { id: FinancesTab; label: string }[] = [
  { id: "coins", label: "Coins" },
  { id: "payments", label: "Payments" },
  { id: "transactions", label: "Transactions" },
];

export function FinancesTabs({ active }: { active: FinancesTab }) {
  return (
    <Tabs value={active}>
      <TabsList variant="line" aria-label="Finances sections" className="h-auto flex-wrap">
        {TABS.map((t) => (
          <TabsTrigger key={t.id} value={t.id} asChild>
            <Link href={financesHref(t.id)} prefetch={false}>
              {t.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
