import { PageShell, SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from "@/components/ds";

// Without a loading boundary a sidebar click shows nothing until the whole
// dynamic page renders (~0.5s+ from far away). This is also what the hover
// prefetch in AppSidebar fetches, so a click paints this instantly.
export default function Loading() {
  return (
    <PageShell>
      <SkeletonPageHeader action />
      <SkeletonStatCards count={4} />
      <SkeletonTable columns={6} />
    </PageShell>
  );
}
