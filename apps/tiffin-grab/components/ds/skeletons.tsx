import { Skeleton } from "@realm/ui/skeleton";
import {
  Table, TableHeader, TableHead, TableBody, TableRow, TableCell,
} from "@realm/ui/table";
import { Card } from "./card";
import { FilterBar } from "./filter-bar";
import { PageShell } from "./page-shell";

// Composable loading-skeleton primitives. Each mirrors the geometry of its real
// DS counterpart (PageHeader / StatCard / FilterBar / Table) so a loading.tsx
// built from these shows no layout shift when the page resolves. Compose, never
// hand-roll per page — a difference in count/columns is a prop, not a new file.

export function SkeletonPageHeader({ action = false, subtitle = false }: { action?: boolean; subtitle?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          {subtitle && <Skeleton className="h-4 w-64" />}
        </div>
      </div>
      {action && <Skeleton className="h-9 w-32" />}
    </div>
  );
}

export function SkeletonStatCards({ count, className = "sm:grid-cols-2 lg:grid-cols-4" }: { count: number; className?: string }) {
  return (
    <div className={`grid gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-2 h-7 w-16" />
        </Card>
      ))}
    </div>
  );
}

export function SkeletonFilterBar({ pills = 0, dropdown = false }: { pills?: number; dropdown?: boolean }) {
  return (
    <FilterBar
      search={<Skeleton className="h-9 w-full" />}
      filters={
        pills > 0 || dropdown ? (
          <>
            {Array.from({ length: pills }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-16 rounded-full" />
            ))}
            {dropdown && <Skeleton className="h-9 w-40" />}
          </>
        ) : undefined
      }
    />
  );
}

export function SkeletonTable({ columns, rows = 8 }: { columns: number; rows?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: columns }).map((_, i) => (
            <TableHead key={i}>
              <Skeleton className="h-4 w-20" />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, r) => (
          <TableRow key={r}>
            {Array.from({ length: columns }).map((_, c) => (
              <TableCell key={c}>
                <Skeleton className="h-4 w-full max-w-32" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function SkeletonListRows({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function SkeletonFormCard({ fields = 3, title = true }: { fields?: number; title?: boolean }) {
  return (
    <Card variant="glow" className="p-5">
      {title && <Skeleton className="h-5 w-32" />}
      <div className="mt-3 grid max-w-md gap-3">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="grid gap-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
        <Skeleton className="mt-1 h-9 w-24" />
      </div>
    </Card>
  );
}

export function SkeletonCardGrid({ count, className = "sm:grid-cols-3" }: { count: number; className?: string }) {
  return (
    <div className={`grid gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full" />
      ))}
    </div>
  );
}

// Whole-page loading skeleton. One component drives every dashboard `loading.tsx`:
// pass the props that describe THAT page's shape (variant + counts) so the skeleton
// mirrors the page's real components. A new page's loading.tsx is a one-liner —
// tune, don't hand-roll.
export function PageSkeleton({
  variant = "table",
  section = true,
  action = true,
  subtitle = true,
  stats,
  filters = 0,
  columns = 6,
  rows = 8,
  fields = 4,
  cards = 6,
}: {
  /** shape of the primary content block */
  variant?: "table" | "form" | "cards" | "list";
  /** wrap body in a SectionCard-style card (false = bare, e.g. detail pages) */
  section?: boolean;
  /** header has a trailing action button */
  action?: boolean;
  /** header has a subtitle line */
  subtitle?: boolean;
  /** render N stat cards above the body */
  stats?: number;
  /** filter-bar pills above a table/list (0 = no filter bar) */
  filters?: number;
  /** table columns */
  columns?: number;
  /** table/list rows */
  rows?: number;
  /** form fields */
  fields?: number;
  /** card-grid count */
  cards?: number;
}) {
  const body =
    variant === "form" ? (
      <SkeletonFormCard fields={fields} />
    ) : variant === "cards" ? (
      <SkeletonCardGrid count={cards} />
    ) : variant === "list" ? (
      <SkeletonListRows rows={rows} />
    ) : (
      <SkeletonTable columns={columns} rows={rows} />
    );

  const filtered =
    filters > 0 ? (
      <div className="space-y-4">
        <SkeletonFilterBar pills={filters} />
        {body}
      </div>
    ) : (
      body
    );

  return (
    <PageShell>
      <SkeletonPageHeader action={action} subtitle={subtitle} />
      {stats ? <SkeletonStatCards count={stats} /> : null}
      {section ? (
        <Card variant="glow" className="p-5">
          <Skeleton className="h-5 w-40" />
          <div className="mt-4">{filtered}</div>
        </Card>
      ) : (
        filtered
      )}
    </PageShell>
  );
}
