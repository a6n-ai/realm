"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@foundry/ui/button";
import { DateInput } from "@/components/dashboard/date-fields";

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
  const tab = useSearchParams().get("tab");
  const [pending, startTransition] = useTransition();

  // Keep the open tab across days; its page/sort/search reset with the new day's data.
  const go = (next: string) => {
    if (!next) return;
    startTransition(() => router.push(`${basePath}?date=${next}${tab ? `&tab=${encodeURIComponent(tab)}` : ""}`));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="label-date" className="text-sm font-medium">
        Delivery date
      </label>
      <DateInput
        id="label-date"
        value={date}
        disabled={pending}
        onChange={go}
      />
      {date !== today ? (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => go(today)}>
          Today
        </Button>
      ) : null}
    </div>
  );
}
