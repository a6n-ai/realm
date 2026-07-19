"use client";

// Pause/Resume is its own control, decoupled from day-click (which is meal selection only).
// Clicking the trigger opens a Dialog on desktop / Drawer on mobile (ResponsiveDialog) to set a
// pause range (or go indefinite, if the plan allows) or to resume — this is the range-select
// calendar that used to live inline in the day-tap flow; it now only ever runs inside this
// dedicated surface.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PauseIcon, PlayIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@realm/ui/button";
import { Switch } from "@realm/ui/switch";
import { Calendar } from "@realm/ui/calendar";
import { ResponsiveDialog } from "@/components/ds";
import { formatDateOnly } from "@/lib/format/datetime";
import type { Subscription } from "@/lib/services/customer-deliveries.service";
import type { PausePanel } from "./delivery-calendar";
import { toIsoLocal } from "./calendar-constants";
import { pauseMySubscription, resumeMySubscription } from "./actions";

function pauseBudgetLines(limits: PausePanel["limits"], usage: PausePanel["usage"]): string[] {
  const lines: string[] = [];
  if (limits.maxPauseDaysTotal != null) lines.push(`${usage.daysUsed} of ${limits.maxPauseDaysTotal} pause-days used`);
  if (limits.maxPauses != null) {
    const remaining = Math.max(limits.maxPauses - usage.count, 0);
    lines.push(`${remaining} pause${remaining === 1 ? "" : "s"} left`);
  }
  if (limits.maxPauseStretchDays != null) lines.push(`Up to ${limits.maxPauseStretchDays} consecutive days per pause`);
  return lines;
}

export function PauseControl({ sub, pausePanel, cutoffByDate }: {
  sub: Subscription;
  pausePanel: PausePanel;
  // date -> cutoff epoch, used to disable already-locked days on the pause range calendar.
  cutoffByDate: Map<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [indefinite, setIndefinite] = useState(false);
  const [pausePending, startPauseTransition] = useTransition();
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [resumePending, startResumeTransition] = useTransition();
  const [resumeError, setResumeError] = useState<string | null>(null);

  const paused = pausePanel.usage.hasOpenPause || sub.status === "paused";
  const { limits, usage } = pausePanel;
  const budgetLines = pauseBudgetLines(limits, usage);
  const canOfferIndefinite = limits.maxPauseStretchDays == null;
  const canSubmit = indefinite ? !!range?.from : !!(range?.from && range?.to);

  const todayIso = toIsoLocal(new Date());
  function isDisabledDay(date: Date): boolean {
    const iso = toIsoLocal(date);
    if (iso < todayIso) return true;
    const cutoff = cutoffByDate.get(iso);
    return cutoff != null && Date.now() > cutoff;
  }

  function submitPause() {
    if (!range?.from) return;
    setPauseError(null);
    const fromIso = toIsoLocal(range.from);
    const untilIso = indefinite ? fromIso : toIsoLocal(range.to ?? range.from);
    startPauseTransition(async () => {
      try {
        await pauseMySubscription(sub.publicId, { from: fromIso, until: untilIso, indefinite: indefinite || undefined });
        router.refresh();
        setRange(undefined);
        setIndefinite(false);
        setOpen(false);
      } catch (e) {
        setPauseError(e instanceof Error ? e.message : "Failed to pause");
      }
    });
  }

  function submitResume() {
    setResumeError(null);
    startResumeTransition(async () => {
      try {
        await resumeMySubscription(sub.publicId);
        router.refresh();
        setOpen(false);
      } catch (e) {
        setResumeError(e instanceof Error ? e.message : "Failed to resume");
      }
    });
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant={paused ? "secondary" : "outline"} size="sm">
          {paused ? <PlayIcon data-icon="inline-start" /> : <PauseIcon data-icon="inline-start" />}
          {paused ? "Resume" : "Pause"}
        </Button>
      }
      title={paused ? "Resume deliveries" : "Pause deliveries"}
      description={sub.planName}
    >
      <div className="space-y-3 px-4 pb-4 sm:px-0 sm:pb-0">
        {paused ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">This subscription is currently paused.</p>
            <Button disabled={resumePending} onClick={submitResume}>
              <PlayIcon data-icon="inline-start" /> Resume deliveries
            </Button>
            {resumeError && <p className="text-bad text-xs">{resumeError}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {budgetLines.length > 0 && (
              <ul className="text-muted-foreground text-xs">
                {budgetLines.map((l) => <li key={l}>{l}</li>)}
              </ul>
            )}
            <Calendar mode="range" selected={range} onSelect={setRange} disabled={isDisabledDay} excludeDisabled className="mx-auto" />
            <p className="text-sm">
              {range?.from
                ? indefinite
                  ? `Pause from ${formatDateOnly(toIsoLocal(range.from), { mode: "short" })} until you resume`
                  : range.to
                    ? `Pause ${formatDateOnly(toIsoLocal(range.from), { mode: "short" })} → ${formatDateOnly(toIsoLocal(range.to), { mode: "short" })}`
                    : "Pick the last paused day"
                : "Select a range on the calendar to pause"}
            </p>
            {canOfferIndefinite && (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={indefinite} onCheckedChange={setIndefinite} size="sm" />
                Until I resume
              </label>
            )}
            <Button variant="secondary" disabled={pausePending || !canSubmit} onClick={submitPause}>
              <PauseIcon data-icon="inline-start" /> Confirm pause
            </Button>
            {pauseError && <p className="text-bad text-xs">{pauseError}</p>}
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
