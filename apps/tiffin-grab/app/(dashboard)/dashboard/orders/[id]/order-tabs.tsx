"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ds";

export const ORDER_TABS = ["overview", "deliveries", "meals", "payments", "activity"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

const LABEL: Record<OrderTab, string> = {
  overview: "Overview",
  deliveries: "Deliveries",
  meals: "Meals",
  payments: "Payments",
  activity: "Activity",
};

/**
 * `?tab=` keeps the open tab across refreshes and shareable links. replaceState (not the router)
 * so switching tabs never refetches the page; Next syncs it into useSearchParams.
 */
export function OrderTabs({ panels, badges }: { panels: Record<OrderTab, ReactNode>; badges?: Partial<Record<OrderTab, ReactNode>> }) {
  const params = useSearchParams();
  const raw = params.get("tab");
  const value: OrderTab = (ORDER_TABS as readonly string[]).includes(raw ?? "") ? (raw as OrderTab) : "overview";

  const select = (next: string) => {
    const sp = new URLSearchParams(params.toString());
    if (next === "overview") sp.delete("tab");
    else sp.set("tab", next);
    // The activity log's page/size belong to its own table, not the other tabs.
    if (next !== "activity") {
      sp.delete("page");
      sp.delete("size");
    }
    const qs = sp.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  };

  return (
    <Tabs value={value} onValueChange={select} className="gap-4">
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <TabsList>
          {ORDER_TABS.map((t) => (
            <TabsTrigger key={t} value={t} className="gap-1.5">
              {LABEL[t]}
              {badges?.[t]}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {ORDER_TABS.map((t) => (
        <TabsContent key={t} value={t} className="space-y-4">
          {panels[t]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
