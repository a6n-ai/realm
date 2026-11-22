import { Card } from "@foundry/ui/card";
import { Skeleton } from "@foundry/ui/skeleton";

export function StripeSettingsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid content-start gap-6">
        {[3, 4, 4].map((rows, i) => (
          <Card key={i} className="grid gap-4 p-5">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: rows }, (_, j) => (
              <Skeleton key={j} className="h-8 w-full sm:max-w-md" />
            ))}
          </Card>
        ))}
      </div>
      <Card className="order-first grid content-start gap-3 p-5 lg:order-none">
        <Skeleton className="h-5 w-24" />
        {Array.from({ length: 6 }, (_, j) => (
          <Skeleton key={j} className="h-5 w-full" />
        ))}
      </Card>
    </div>
  );
}
