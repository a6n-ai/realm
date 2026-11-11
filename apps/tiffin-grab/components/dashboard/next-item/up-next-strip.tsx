import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Card } from "@foundry/ui/card";

/** Phones show this many tiles as a list; the rest are desktop-only in the horizontal row. */
const PHONE_TILES = 3;
const MAX_TILES = 6;

export type UpNextTile = { key: string; href: string; title: string; badge?: ReactNode; hint?: string };

/** Whole-tile links; a tile's href sets the card's param (`lead=`, `renewal=`, `order=`) so it becomes the main card. */
export function UpNextStrip({ label, tiles, more, viewAllHref }: { label: string; tiles: UpNextTile[]; more: number; viewAllHref: string }) {
  return (
    <section aria-label={`Up next ${label}`} className="mt-3 flex flex-col gap-2 border-t pt-3">
      <div tabIndex={0} aria-label={`Up next ${label} tiles`} className="focus-visible:ring-ring flex flex-col gap-2 focus-visible:outline-none focus-visible:ring-2 md:snap-x md:flex-row md:gap-3 md:overflow-x-auto md:pb-2">
        {tiles.slice(0, MAX_TILES).map((tile, i) => (
          <Link
            key={tile.key}
            href={tile.href}
            prefetch={false}
            className={`group w-full focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 md:w-64 md:shrink-0 md:snap-start ${i >= PHONE_TILES ? "hidden md:block" : ""}`}
          >
            <Card size="sm" className="h-full transition-colors group-hover:bg-muted/50">
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{tile.title}</span>
                <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
              </div>
              {tile.badge ? <div className="flex min-w-0 flex-wrap items-center gap-2">{tile.badge}</div> : null}
              {tile.hint ? <p className="text-muted-foreground truncate text-xs">{tile.hint}</p> : null}
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
