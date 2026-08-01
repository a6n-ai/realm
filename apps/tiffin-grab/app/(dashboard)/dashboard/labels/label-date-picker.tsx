"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@realm/ui/button";

// Native date input rather than a calendar component: this picks one day, and the browser's
// own control is keyboard- and mobile-friendly for free.
export function LabelDatePicker({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (next: string) => {
    if (!next) return;
    startTransition(() => router.push(`/dashboard/labels?date=${next}`));
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
