import { PageShell, SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from "@/components/ds";

// Overview only. Each parent page + loading.tsx sits in an `(index)` group so its skeleton
// wraps that page alone: without PPR, prefetch stops at the first loading.tsx on the
// path, so an unscoped parent skeleton would paint before every child page's own.
export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <SkeletonPageHeader action />
        <SkeletonStatCards count={4} />
        <SkeletonTable columns={6} />
      </PageShell>
    </div>
  );
}
