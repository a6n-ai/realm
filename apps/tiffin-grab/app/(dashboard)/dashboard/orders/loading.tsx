import { Skeleton } from "@foundry/ui/skeleton";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { NextItemSkeleton } from "@/components/dashboard/next-item/next-item-card";
import { OrdersChrome } from "./orders-chrome";
import { OrdersListSkeleton } from "./orders-list";
import { OrdersViewTabs } from "./orders-view-tabs";

export default function Loading() {
  return (
    <OrdersChrome
      newOrder={<Skeleton className="h-9 w-32" />}
      stats={<StatCardsSkeleton count={5} />}
      next={<NextItemSkeleton title="Next order" />}
      tabs={<OrdersViewTabs showPayment />}
      list={<OrdersListSkeleton />}
    />
  );
}
