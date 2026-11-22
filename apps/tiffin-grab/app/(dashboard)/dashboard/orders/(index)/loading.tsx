import { Skeleton } from "@foundry/ui/skeleton";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { RecommendationGridSkeleton } from "@/components/dashboard/next-item/recommendation-grid";
import { OrdersChrome } from "../orders-chrome";
import { OrdersListSkeleton } from "../orders-list";
import { OrdersViewTabs } from "../orders-view-tabs";

export default function Loading() {
  return (
    <OrdersChrome
      newOrder={<Skeleton className="h-9 w-32" />}
      stats={<StatCardsSkeleton count={5} />}
      next={<RecommendationGridSkeleton title="Next order" />}
      tabs={<OrdersViewTabs showPayment />}
      list={<OrdersListSkeleton />}
    />
  );
}
