import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Card } from "@foundry/ui/card";
import { displayName } from "@/lib/inquiries/display";
import { ago, FollowUpBadge } from "./follow-up-badge";
import type { UpNextRow } from "./next-lead-card";
/** Phones show this many tiles as a list; the rest are desktop-only in the horizontal row. */
const PHONE_TILES = 3;
type StripProps = { rows: UpNextRow[]; more: number; viewAllHref: string; dayStart: number; dayEnd: number; now: number; timeZone: string; showOwner: boolean };
/** Whole-tile links that make the tile the main card (`href` sets `lead=`); no controls inside. */
export function UpNextStrip({ rows, more, viewAllHref, dayStart, dayEnd, now, timeZone, showOwner }: StripProps) {
  return (
    <section aria-label="Up next leads" className="mt-3 flex flex-col gap-2 border-t pt-3">
      <div tabIndex={0} aria-label="Up next tiles" className="focus-visible:ring-ring flex flex-col gap-2 focus-visible:outline-none focus-visible:ring-2 md:snap-x md:flex-row md:gap-3 md:overflow-x-auto md:pb-2">
        {rows.map((row, i) => (
          <Link
            key={row.publicId}
            href={row.href}
            prefetch={false}
            className={`group w-full focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 md:w-64 md:shrink-0 md:snap-start ${i >= PHONE_TILES ? "hidden md:block" : ""}`}
          >
            <Card size="sm" className="h-full transition-colors group-hover:bg-muted/50">
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{displayName(row)}</span>
                <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <FollowUpBadge lead={row} dayStart={dayStart} dayEnd={dayEnd} now={now} timeZone={timeZone} />
              </div>
              <p className="text-muted-foreground truncate text-xs">
                {[showOwner ? (row.ownerName ?? "Unassigned") : null, row.lastNote ?? row.planInterest ?? ago(row.createdAt, now)].filter(Boolean).join(" · ")}
              </p>
            </Card>
          </Link>
        ))}
      </div>
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span className="tabular-nums">{more > 0 ? `Up next, ${more} more` : "Up next"}</span>
        <Button variant="link" size="sm" asChild>
          <Link href={viewAllHref} prefetch={false}>View all open</Link>
        </Button>
      </div>
    </section>
  );
}
