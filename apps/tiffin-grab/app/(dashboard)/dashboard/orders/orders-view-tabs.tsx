"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@foundry/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";

const VIEWS = ["lookout", "missed"] as const;

/** All orders, the ones a team member marked "Look out for", or past days nobody confirmed went out. Switching drops the other tab's filters. */
export function OrdersViewTabs({ lookOutCount, missedCount }: { lookOutCount: number; missedCount: number }) {
  const raw = useSearchParams().get("view");
  const view = VIEWS.find((v) => v === raw) ?? "all";
  return (
    <Tabs value={view}>
      <TabsList variant="line" aria-label="Order lists">
        <TabsTrigger value="all" asChild>
          <Link href="/dashboard/orders" prefetch={false}>All orders</Link>
        </TabsTrigger>
        <TabsTrigger value="lookout" asChild className="gap-1.5">
          <Link href="/dashboard/orders?view=lookout" prefetch={false}>
            Look out for
            {lookOutCount > 0 && <Badge variant="secondary" className="h-5 px-1.5 tabular-nums">{lookOutCount}</Badge>}
          </Link>
        </TabsTrigger>
        <TabsTrigger value="missed" asChild className="gap-1.5">
          <Link href="/dashboard/orders?view=missed" prefetch={false}>
            Missed deliveries
            {missedCount > 0 && <Badge variant="destructive" className="h-5 px-1.5 tabular-nums">{missedCount}</Badge>}
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
