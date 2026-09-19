import type { ReactNode } from "react";
import { Card } from "@/components/ds";

/**
 * Lightweight secondary list — a page should have exactly one real DataTable (borders,
 * header row, sort, pagination); anything smaller and supplementary (a recap, a handful
 * of exceptions to review) reads better as compact rows in a plain card than as a second
 * table competing for the same visual weight.
 */
export function ListCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <Card variant="flat" className="space-y-3 p-4">
      {title ? <p className="text-sm font-medium">{title}</p> : null}
      <div className="divide-y rounded-lg border">{children}</div>
    </Card>
  );
}

export function ListCardRow({
  primary,
  secondary,
  trailing,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{primary}</p>
        {secondary ? <p className="text-muted-foreground truncate text-xs">{secondary}</p> : null}
      </div>
      {trailing ? <div className="text-muted-foreground shrink-0 text-xs">{trailing}</div> : null}
    </div>
  );
}
