"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@foundry/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";

/** All orders, or only the ones a team member marked "Look out for". Switching drops the other tab's filters. */
export function OrdersViewTabs({ lookOutCount }: { lookOutCount: number }) {
  const view = useSearchParams().get("view") === "lookout" ? "lookout" : "all";
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
      </TabsList>
    </Tabs>
  );
}
