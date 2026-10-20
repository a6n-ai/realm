import Link from "next/link";
import { CalendarPlusIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";

export function CalendarSkeleton() {
  return <Skeleton className="h-[calc(100dvh-16rem)] min-h-[32rem] w-full" />;
}

export function CalendarEmpty() {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3">
      <p className="text-muted-foreground text-sm">Nothing scheduled in this range.</p>
      <Button asChild size="sm" variant="outline">
        <Link href="/dashboard/sessions/new">
          <CalendarPlusIcon />
          New session
        </Link>
      </Button>
    </div>
  );
}
