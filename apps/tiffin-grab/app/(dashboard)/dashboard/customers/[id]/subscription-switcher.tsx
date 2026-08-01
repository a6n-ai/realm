"use client";

import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@realm/ui/dropdown-menu";
import { OrderStatusBadge } from "@/components/ds";

export type SwitchableOrder = {
  publicId: string;
  deploymentId: string;
  planName: string;
  status: string;
  startDate: string;
};

const label = (o: SwitchableOrder) => `${o.deploymentId} · ${o.planName}`;

/**
 * One subscription is shown at a time, chosen here — the page is per-customer but the
 * panel below it is per-order. Navigation is plain links carrying ?order=, so the choice
 * survives a refresh and can be shared with a colleague.
 *
 * Dropping the month param on switch is deliberate: a month that exists on one
 * subscription's calendar may be outside another's date range entirely.
 */
export function SubscriptionSwitcher({
  orders,
  selected,
  basePath,
}: {
  orders: SwitchableOrder[];
  selected: SwitchableOrder;
  basePath: string;
}) {
  if (orders.length === 1) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{label(selected)}</span>
        <OrderStatusBadge status={selected.status} />
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span className="truncate">{label(selected)}</span>
          <OrderStatusBadge status={selected.status} />
          <ChevronDownIcon className="size-4 shrink-0" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[min(22rem,90vw)]">
        {orders.map((o) => (
          <DropdownMenuItem key={o.publicId} asChild>
            <Link href={`${basePath}?order=${o.publicId}`} className="flex items-center gap-2">
              <span className="truncate">{label(o)}</span>
              <OrderStatusBadge status={o.status} />
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
