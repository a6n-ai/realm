import { Skeleton } from "@foundry/ui/skeleton";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { RecommendationGridSkeleton } from "@/components/dashboard/next-item/recommendation-grid";
import { InquiriesChrome } from "./inquiries-chrome";
import { InquiriesListSkeleton } from "./inquiries-list";

export default function Loading() {
  return (
    <InquiriesChrome
      addActions={<Skeleton className="h-9 w-32" />}
      stats={<StatCardsSkeleton count={5} />}
      next={<RecommendationGridSkeleton title="Next leads" entity />}
      queue={<InquiriesListSkeleton />}
    />
  );
}
