"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@foundry/ui/button";
import { WeekStartPicker } from "./week-start-picker";
import { upsertWeek } from "./actions";
import { sanitizeClientError } from "@/lib/format/client-error";

/**
 * Starting a week is a decision, so it lives on the list page; building it is a workspace,
 * so it gets its own route. Creating a draft goes straight into the editor — nobody picks a
 * Monday in order to stay on the index.
 */
export function NewWeekCard({ takenWeekStarts }: { takenWeekStarts: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [weekStart, setWeekStart] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    if (!weekStart) return;
    start(async () => {
      setError(null);
      try {
        const w = await upsertWeek({ weekStart });
        if ("error" in w) {
          setError(sanitizeClientError(w.error));
          return;
        }
        router.push(`/dashboard/menus/${w.publicId}`);
      } catch (e) {
        setError(sanitizeClientError(e, "Could not create the week"));
      }
    });
  };

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Monday</label>
          {/* Weeks already built are disabled in the picker, so a duplicate cannot be started. */}
          <WeekStartPicker value={weekStart} onChange={setWeekStart} disabledDates={takenWeekStarts} />
        </div>
        <Button className="transition-transform active:scale-[0.96]" onClick={create} disabled={pending || !weekStart}>
          Start this week
        </Button>
      </div>
    </div>
  );
}
