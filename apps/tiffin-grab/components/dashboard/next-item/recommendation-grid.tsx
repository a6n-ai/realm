import Link from "next/link";
import type { ReactNode } from "react";
import { SectionCard } from "@/components/ds";
import { Card } from "@foundry/ui/card";
import { Skeleton } from "@foundry/ui/skeleton";
import { OwnerPicker, type OwnerOption } from "./owner-picker";
import { NextItemError } from "./next-item-error";
import { scopeHint } from "./next-item-card";
import { RecommendationCard } from "./recommendation-card";

/** One row of recommendations; the services fetch this many and the grid shows no more. */
export const RECOMMENDATION_LIMIT = 3;

export type RecommendationOwner = { current: string; options: OwnerOption[] };

export type RecommendationItem = {
  key: string;
  name: string;
  /** Opens the item's page; also the name's link and the Open action. */
  href: string;
  reason?: ReactNode;
  status?: ReactNode;
  contact?: ReactNode;
  /** Icon-only secondary actions, before Open. */
  actions?: ReactNode;
};

export type RecommendationGridProps = {
  title: string;
  owner: RecommendationOwner;
  /** Items that need action in the viewer's scope; the header links the full list beside it. */
  toAct: number;
  viewAllHref: string;
  items: RecommendationItem[];
  empty: ReactNode;
  /** Loader failure: shown inline in place of the grid, with Retry. */
  error?: string;
};

export function RecommendationGrid({ title, owner, toAct, viewAllHref, items, empty, error }: RecommendationGridProps) {
  const label = owner.options.find((o) => o.value === owner.current)?.label ?? "Me";
  const action = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-xs">{scopeHint(owner.current, owner.options)}</span>
      <OwnerPicker label={label} options={owner.options} />
      <span className="text-muted-foreground text-xs tabular-nums">
        {toAct} to act on · <Link href={viewAllHref} prefetch={false} className="text-foreground underline-offset-4 hover:underline">View all</Link>
      </span>
    </div>
  );
  return (
    <SectionCard title={title} action={action}>
      {error ? (
        <NextItemError message={error} />
      ) : items.length === 0 ? (
        empty
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {items.slice(0, RECOMMENDATION_LIMIT).map((item) => (
            <RecommendationCard key={item.key} item={item} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export function RecommendationGridSkeleton({ title }: { title: string }) {
  return (
    <SectionCard title={title} action={<Skeleton className="h-8 w-40" />}>
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} size="sm" className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-8 w-24" />
          </Card>
        ))}
      </div>
    </SectionCard>
  );
}
