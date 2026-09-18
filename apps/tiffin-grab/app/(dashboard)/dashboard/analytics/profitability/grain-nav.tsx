"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { cn } from "@foundry/ui/cn";
import { addMonths, type Grain } from "@/lib/analytics/profitability";

const GRAINS: { id: Grain; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

function href(view: Grain, month: string) {
  return `/dashboard/analytics/profitability?view=${view}&month=${month}`;
}

export function GrainNav({ view, month }: { view: Grain; month: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="bg-muted/60 flex rounded-lg p-0.5">
        {GRAINS.map((g) => (
          <Link
            key={g.id}
            href={href(g.id, month)}
            prefetch={false}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              view === g.id ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
            )}
          >
            {g.label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-8" asChild>
          <Link href={href(view, addMonths(month, -1))} prefetch={false} aria-label="Previous month">
            <ChevronLeftIcon className="size-4" />
          </Link>
        </Button>
        <Input
          type="month"
          aria-label="Month"
          className="h-8 w-[10.5rem]"
          value={month}
          onChange={(e) => {
            if (e.target.value) router.push(href(view, e.target.value));
          }}
        />
        <Button variant="ghost" size="icon" className="size-8" asChild>
          <Link href={href(view, addMonths(month, 1))} prefetch={false} aria-label="Next month">
            <ChevronRightIcon className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
