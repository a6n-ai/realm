"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@foundry/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";

const VIEWS = ["lookout", "payment", "free", "missed"] as const;

/** All orders, the ones a team member marked "Look out for", payments waiting on review, or past days nobody confirmed went out. Switching drops the other tab's filters. */
export function OrdersViewTabs({
  lookOutCount = 0,
  missedCount = 0,
  paymentReviewCount = 0,
  freeCount = 0,
  showPayment,
}: {
  lookOutCount?: number;
  missedCount?: number;
  paymentReviewCount?: number;
  freeCount?: number;
  showPayment: boolean;
}) {
  const raw = useSearchParams().get("view");
  const view = VIEWS.find((v) => v === raw && (v !== "payment" || showPayment)) ?? "all";
  return (
    <Tabs value={view} activation="manual">
      <TabsList variant="line" aria-label="Order lists">
        <TabsTrigger value="all" render={<Link href="/dashboard/orders" prefetch={false} />}>
          All orders
        </TabsTrigger>
        <TabsTrigger value="lookout" className="gap-1.5" render={<Link href="/dashboard/orders?view=lookout" prefetch={false} />}>
          Look out for
          {lookOutCount > 0 && <Badge variant="secondary" className="h-5 px-1.5 tabular-nums">{lookOutCount}</Badge>}
        </TabsTrigger>
        {showPayment && (
          <TabsTrigger value="payment" className="gap-1.5" render={<Link href="/dashboard/orders?view=payment" prefetch={false} />}>
            Payment review
            {paymentReviewCount > 0 && <Badge variant="secondary" className="h-5 px-1.5 tabular-nums">{paymentReviewCount}</Badge>}
          </TabsTrigger>
        )}
        <TabsTrigger value="free" className="gap-1.5" render={<Link href="/dashboard/orders?view=free" prefetch={false} />}>
          Free tiffins
          {freeCount > 0 && <Badge variant="secondary" className="h-5 px-1.5 tabular-nums">{freeCount}</Badge>}
        </TabsTrigger>
        <TabsTrigger value="missed" className="gap-1.5" render={<Link href="/dashboard/orders?view=missed" prefetch={false} />}>
          Missed deliveries
          {missedCount > 0 && <Badge variant="destructive" className="h-5 px-1.5 tabular-nums">{missedCount}</Badge>}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
