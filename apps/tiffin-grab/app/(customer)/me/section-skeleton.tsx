import { SectionCard } from "@realm/design-system";
import { Skeleton } from "@realm/ui/skeleton";

// Shared Suspense fallback for every home section. Keeps the section's title
// visible while its data component resolves (no layout shift, no title flash).
// A presentational server component — safe to import from server section data
// components as their `fallback`. Tasks 8–12 may ship a section-shaped skeleton
// twin; this generic one scaffolds the shell.
export function SectionSkeleton({ title, rows = 2 }: { title: string; rows?: number }) {
  return (
    <SectionCard title={title}>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className={i === 0 ? "h-4 w-3/4" : "h-4 w-1/2"} />
        ))}
      </div>
    </SectionCard>
  );
}
