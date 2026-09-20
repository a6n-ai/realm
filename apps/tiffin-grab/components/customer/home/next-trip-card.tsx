import Link from "next/link";
import { ArrowRightIcon, TruckIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { formatDateOnly } from "@/lib/format/datetime";
import { formatCoversLabel } from "@/lib/menu/coverage";

export function NextTripCard({
  deliveryDate,
  coveredDates,
  today,
  tiffinsLeft,
}: {
  deliveryDate: string | null;
  coveredDates: string[];
  today: string;
  tiffinsLeft?: number | null;
}) {
  if (!deliveryDate) {
    return (
      <section className="bg-card rounded-3xl border p-5 sm:p-6">
        <p className="text-primary text-xs font-semibold tracking-[0.2em] uppercase">Next delivery</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-balance">Nothing scheduled yet</p>
        <p className="text-muted-foreground mt-1 text-sm text-pretty">Start a plan and your first tiffin shows up here.</p>
        <Button asChild className="mt-4 h-12 rounded-full px-6 shadow-[0_12px_30px_-6px_var(--color-primary)]">
          <Link href="/subscribe">Browse plans</Link>
        </Button>
      </section>
    );
  }
  const isToday = deliveryDate === today;
  const covers = formatCoversLabel(coveredDates);
  return (
    <section className="bg-primary/10 border-primary/25 relative overflow-hidden rounded-3xl border p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-full">
          <TruckIcon className="size-4" aria-hidden />
        </span>
        <p className="text-primary text-xs font-semibold tracking-[0.2em] uppercase">{isToday ? "Arriving today" : "Next delivery"}</p>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {formatDateOnly(deliveryDate, { mode: "weekdayLong" })}
      </p>
      <p className="text-muted-foreground mt-0.5 text-sm">{formatDateOnly(deliveryDate, { mode: "monthDay" })}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {covers && <span className="bg-card rounded-full border px-3 py-1 text-xs font-semibold">{covers}</span>}
        {tiffinsLeft != null && (
          <span className="bg-card text-muted-foreground rounded-full border px-3 py-1 text-xs font-medium tabular-nums">
            {tiffinsLeft} tiffins left
          </span>
        )}
      </div>
      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
        <Button asChild className="hover-lift h-12 rounded-full px-6 shadow-[0_12px_30px_-6px_var(--color-primary)]">
          <Link href="/me/meals">
            Pick meals <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </Button>
        <Button asChild variant="outline" className="bg-card h-12 rounded-full px-6">
          <Link href="/me/deliveries">Manage deliveries</Link>
        </Button>
      </div>
    </section>
  );
}

export function NextTripCardSkeleton() {
  return (
    <div className="bg-card rounded-3xl border p-5 sm:p-6">
      <Skeleton className="h-9 w-40 rounded-full" />
      <Skeleton className="mt-4 h-10 w-56" />
      <Skeleton className="mt-2 h-4 w-24" />
      <Skeleton className="mt-3 h-7 w-40 rounded-full" />
      <div className="mt-5 flex gap-2.5">
        <Skeleton className="h-12 w-36 rounded-full" />
        <Skeleton className="h-12 w-44 rounded-full" />
      </div>
    </div>
  );
}
