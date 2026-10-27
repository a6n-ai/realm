import { Card, ListGroup, Skeleton, StatGroup } from "@/components/customer/kit";
import { cn } from "@/components/customer/kit/cn";

// Loading twins of the kit's own shapes, sized to match them so a page doesn't jump when its content lands.

/** One bare StatTile: icon tile + label, the 28px number, a caption line. */
export function StatCellSkeleton({ hint = true, tile = true }: { hint?: boolean; tile?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        {tile && <Skeleton className="size-8 shrink-0 rounded-lg" />}
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="mt-1 h-7 w-20" />
      {hint && <Skeleton className="h-[18px] w-28 max-w-full" />}
    </div>
  );
}

/** StatGroup: `cells` stats side by side in one split card. */
export function StatGroupSkeleton({ cells = 2, hint = true, tile = true }: { cells?: number; hint?: boolean; tile?: boolean }) {
  return (
    <StatGroup>
      {Array.from({ length: cells }, (_, i) => <StatCellSkeleton key={i} hint={hint} tile={tile} />)}
    </StatGroup>
  );
}

/** ListRow: optional IconTile square, label + sublabel, optional trailing value. */
export function ListRowSkeleton({ tile = true, sublabel = true, trailing = true, chevron = false }: { tile?: boolean; sublabel?: boolean; trailing?: boolean; chevron?: boolean }) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-3">
      {tile && <Skeleton className="size-8 shrink-0 rounded-lg" />}
      <div className="min-w-0 flex-1 space-y-1">
        <Skeleton className="h-[18px] w-40 max-w-full" />
        {sublabel && <Skeleton className="h-3.5 w-28 max-w-full" />}
      </div>
      {trailing && <Skeleton className="h-[18px] w-12 shrink-0" />}
      {chevron && <Skeleton className="size-4 shrink-0 rounded-sm" />}
    </div>
  );
}

export function ListGroupSkeleton({ rows = 3, className, ...row }: { rows?: number; className?: string } & Parameters<typeof ListRowSkeleton>[0]) {
  return (
    <ListGroup className={className}>
      {Array.from({ length: rows }, (_, i) => <ListRowSkeleton key={i} {...row} />)}
    </ListGroup>
  );
}

/** The 22px `c-h2` heading. */
export function H2Skeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-[26px] w-40", className)} />;
}

/** GroupHeader: small uppercase month label above a ListGroup. */
export function GroupHeaderSkeleton() {
  return (
    <div className="px-4 pb-2">
      <Skeleton className="h-[18px] w-28" />
    </div>
  );
}

/** FilterBar: the capsule filter trigger. */
export function FilterBarSkeleton() {
  return <Skeleton className="h-9 w-28 rounded-full" />;
}

/** Tabs (variant "tabs"): a row of 44px capsules. */
export function TabsSkeleton({ widths = ["w-20", "w-24", "w-16", "w-32"] }: { widths?: string[] }) {
  return (
    <div className="flex gap-1.5 overflow-hidden">
      {widths.map((w, i) => <Skeleton key={i} className={cn("h-11 flex-none rounded-full", w)} />)}
    </div>
  );
}

/** A month group: header + ListGroup. */
export function MonthGroupSkeleton({ rows = 3, ...row }: { rows?: number } & Parameters<typeof ListRowSkeleton>[0]) {
  return (
    <div>
      <GroupHeaderSkeleton />
      <ListGroupSkeleton rows={rows} {...row} />
    </div>
  );
}

/** StepList: a card of IconTile-led steps. */
export function StepListSkeleton({ steps = 3 }: { steps?: number }) {
  return (
    <Card className="p-5">
      <div className="space-y-5">
        {Array.from({ length: steps }, (_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-1 pt-0.5">
              <Skeleton className="h-[22px] w-36 max-w-full" />
              <Skeleton className="h-[18px] w-full" />
              <Skeleton className="h-[18px] w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

