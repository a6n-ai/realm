import { ListGroup, PageHeader, Skeleton } from "@/components/customer/kit";
import { ListRowSkeleton } from "@/components/customer/skeleton-parts";

// Mirrors AccountPage's list view: avatar row, Settings-style groups of icon-tile rows, and (desktop) the profile pane.
const GROUPS = [{ rows: 2, footer: false }, { rows: 3, footer: true }, { rows: 1, footer: false }, { rows: 1, footer: false }];

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="mx-auto max-w-5xl space-y-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <PageHeader eyebrow="Account" title="Your" accent="account" />
      <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-10">
        <div className="space-y-6">
          <ListGroup>
            <div className="flex min-h-[4.5rem] items-center gap-3 px-4 py-3">
              <Skeleton className="size-14 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1">
                <Skeleton className="h-[22px] w-36 max-w-full" />
                <Skeleton className="h-[18px] w-48 max-w-full" />
              </div>
              <Skeleton className="size-4 shrink-0 rounded-sm" />
            </div>
          </ListGroup>
          {GROUPS.map((g, i) => (
            <div key={i}>
              <div className="px-4 pb-2"><Skeleton className="h-4 w-20" /></div>
              <ListGroup>
                {Array.from({ length: g.rows }, (_, r) => <ListRowSkeleton key={r} chevron trailing={false} />)}
              </ListGroup>
              {g.footer && <div className="px-4 pt-2"><Skeleton className="h-[18px] w-56 max-w-full" /></div>}
            </div>
          ))}
          <ListGroup>
            <div className="flex min-h-12 items-center gap-3 px-4 py-2">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <Skeleton className="h-[22px] w-20" />
            </div>
          </ListGroup>
        </div>
        <section className="hidden max-w-2xl space-y-2 lg:block">
          <div className="px-4"><Skeleton className="h-4 w-16" /></div>
          <div className="c-surface space-y-5 rounded-3xl bg-[var(--card)] p-5">
            <div className="flex items-center gap-4">
              <Skeleton className="size-20 shrink-0 rounded-full" />
              <Skeleton className="h-11 w-32 rounded-full" />
            </div>
            <div className="grid max-w-md gap-4">
              {Array.from({ length: 2 }, (_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-[52px]" />
                </div>
              ))}
              <Skeleton className="h-[50px] w-40 rounded-full" />
            </div>
          </div>
          <div className="px-4"><Skeleton className="h-[18px] w-52" /></div>
        </section>
      </div>
    </div>
  );
}
