import Link from "next/link";
import type { ReactNode } from "react";
import { SectionCard } from "@/components/ds";
import { Card, CardContent } from "@foundry/ui/card";
import { Skeleton } from "@foundry/ui/skeleton";
import { OwnerPicker, type OwnerOption } from "./owner-picker";
import { NextItemError } from "./next-item-error";
import { scopeHint } from "./next-item-parts";
import { RecommendationCard } from "./recommendation-card";

/** One row of recommendations; the services fetch this many and the grid shows no more. */
export const RECOMMENDATION_LIMIT = 3;

export type RecommendationOwner = { current: string; options: OwnerOption[] };

export type RecommendationItem = {
  key: string;
  name: string;
  /** Opens the item's page: the name's link. */
  href: string;
  /** The muted line under the name. */
  reason?: ReactNode;
  /** The pill beside the name. */
  status?: ReactNode;
  /** The row's right side: a RecommendationActions, up to two icon buttons plus More actions. */
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
          <Card key={i} size="sm" className="h-full">
            <CardContent className="flex min-w-0 items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Skeleton className="size-8" />
                <Skeleton className="size-8" />
                <Skeleton className="size-8" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </SectionCard>
  );
}
