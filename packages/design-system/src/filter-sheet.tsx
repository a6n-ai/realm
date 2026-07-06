"use client";
import type { ReactNode } from "react";
import { SlidersHorizontalIcon } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@realm/ui/sheet";
import { Button } from "@realm/ui/button";

// A "Filters" trigger opening a bottom sheet of secondary filters, with an
// active-count badge. Used on mobile to keep the filter row to one primary control.
export function FilterSheet({ activeCount = 0, iconOnly, children }: { activeCount?: number; iconOnly?: boolean; children: ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11 gap-2 sm:min-h-0">
          <SlidersHorizontalIcon className="size-4" />
          {iconOnly ? <span className="hidden sm:inline">Filters</span> : "Filters"}
          {activeCount > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs">{activeCount}</span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-xl">
        <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
        <div className="grid gap-4 px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
