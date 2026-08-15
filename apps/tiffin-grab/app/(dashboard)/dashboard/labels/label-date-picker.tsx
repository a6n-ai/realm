"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@realm/ui/button";

// Native date input rather than a calendar component: this picks one day, and the browser's
// own control is keyboard- and mobile-friendly for free.
//
// Shared by the Labels and Routes pages — basePath decides which page a date change lands
// on. Defaulting to /dashboard/labels kept the original caller working when Routes started
// reusing this component, but that default was never meant to apply there too; Routes must
// pass its own path or a date change silently strands the user on Labels with no route
// controls in sight.
export function LabelDatePicker({
  date,
  today,
  basePath = "/dashboard/labels",
}: {
  date: string;
  today: string;
  basePath?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (next: string) => {
    if (!next) return;
    startTransition(() => router.push(`${basePath}?date=${next}`));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="label-date" className="text-sm font-medium">
        Delivery date
      </label>
      <input
        id="label-date"
        type="date"
        value={date}
        disabled={pending}
        onChange={(e) => go(e.target.value)}
        className="h-9 rounded-lg border bg-transparent px-2 text-sm"
      />
      {date !== today ? (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => go(today)}>
          Today
        </Button>
      ) : null}
    </div>
  );
}
