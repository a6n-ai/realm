"use client";

import { useRouter } from "next/navigation";
import { Tabs } from "@/components/customer/kit";
import type { FinancesTab } from "./finances-tab";

const TABS: { id: FinancesTab; label: string }[] = [
  { id: "coins", label: "Coins" },
  { id: "bills", label: "Bills" },
  { id: "transactions", label: "Transactions" },
];

export function tabHref(id: FinancesTab): string {
  return id === "coins" ? "/me/wallet" : `/me/wallet?tab=${id}`;
}

export function FinancesTabs({ active }: { active: FinancesTab }) {
  const router = useRouter();
  return (
    <Tabs
      label="Finances sections"
      idPrefix="finances"
      items={TABS}
      value={active}
      onChange={(id) => router.push(tabHref(id as FinancesTab))}
    />
  );
}
