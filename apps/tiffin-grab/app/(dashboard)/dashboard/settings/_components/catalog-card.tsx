import type { ReactNode } from "react";
import { Skeleton } from "@foundry/ui/skeleton";
import { Card, CardContent, CardFooter, CardHeader } from "@foundry/ui/card";
import { IconTileSkeleton } from "./icon-tile";

/** App Store–style card shared by the plugin marketplace and Add payment method. */
export function CatalogCard({
  tile,
  title,
  category,
  menu,
  description,
  status,
  action,
}: {
  tile: ReactNode;
  title: ReactNode;
  category: ReactNode;
  /** Top-right overflow menu (installed items). */
  menu?: ReactNode;
  description: ReactNode;
  /** Bottom-left status badge. */
  status?: ReactNode;
  /** Bottom-right primary action. */
  action?: ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start gap-3">
          {tile}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
            <span className="text-muted-foreground text-xs">{category}</span>
          </div>
          {menu}
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-muted-foreground line-clamp-2 text-sm">{description}</p>
      </CardContent>
      <CardFooter className="justify-between gap-2">
        {status ?? <span />}
        {action}
      </CardFooter>
    </Card>
  );
}

export function CatalogGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

export function CatalogShelf({ title, count, children }: { title?: string | null; count?: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      {title ? (
        <h2 className="text-sm font-semibold tracking-tight">
          {title} {count != null ? <span className="text-muted-foreground font-normal tabular-nums">{count}</span> : null}
        </h2>
      ) : null}
      <CatalogGrid>{children}</CatalogGrid>
    </section>
  );
}

export function CatalogCardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start gap-3">
          <IconTileSkeleton size="lg" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-8 w-20" />
      </CardFooter>
    </Card>
  );
}

export function CatalogShelfSkeleton({ cards }: { cards: number }) {
  return (
    <section className="flex flex-col gap-3" aria-busy="true">
      <Skeleton className="h-5 w-24" />
      <CatalogGrid>
        {Array.from({ length: cards }, (_, i) => (
          <CatalogCardSkeleton key={i} />
        ))}
      </CatalogGrid>
    </section>
  );
}
