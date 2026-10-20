"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { WeekStartPicker } from "./week-start-picker";
import { upsertWeek } from "./actions";
import { sanitizeClientError } from "@/lib/format/client-error";

/**
 * Starting a week is a rare decision, so it is a button that opens the Monday picker instead of a
 * card on top of the list. Creating a draft goes straight into the editor.
 */
export function NewWeekButton({ takenWeekStarts }: { takenWeekStarts: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
    <>
      <Button onClick={() => setOpen(true)}><Plus data-icon="inline-start" />New week</Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Start a week</DialogTitle>
            <DialogDescription>Weeks start on Monday. Weeks that already have a menu can&apos;t be picked.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <WeekStartPicker value={weekStart} onChange={setWeekStart} disabledDates={takenWeekStarts} />
            {error ? <p className="text-destructive text-sm" role="alert">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={pending || !weekStart}>Start this week</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
