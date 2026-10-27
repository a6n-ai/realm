import { PageHeader, Skeleton } from "@/components/customer/kit";

// Mirrors AccountPage's list view: mobile section list, desktop sidebar + form pane.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="mx-auto max-w-5xl space-y-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <PageHeader eyebrow="Account" title="Your" accent="account" />
      <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-10">
        <div className="space-y-6">
          <Skeleton className="h-[4.5rem] rounded-3xl" />
          <Skeleton className="h-36 rounded-3xl" />
          <Skeleton className="h-36 rounded-3xl" />
          <Skeleton className="h-12 rounded-3xl" />
        </div>
        <div className="hidden space-y-4 lg:block">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-24 rounded-full" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12 w-36" />
        </div>
      </div>
    </div>
  );
}
