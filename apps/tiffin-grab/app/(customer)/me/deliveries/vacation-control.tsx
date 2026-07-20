"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PalmtreeIcon, PlayIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { ResponsiveDialog } from "@/components/ds";
import { formatDateOnly } from "@/lib/format/datetime";
import type { CustomerDelivery, Subscription } from "@/lib/services/customer-deliveries.service";
import type { PausePanel } from "./delivery-calendar";
import { toIsoLocal } from "./calendar-constants";
import { pauseMySubscription, resumeMySubscription } from "./actions";
import {
  buildVacationPauseRequest,
  vacationRequiresEndDate,
  vacationSummaryMessage,
} from "./vacation-pause";
import { VacationDateField } from "./vacation-date-field";

function pauseBudgetLines(limits: PausePanel["limits"], usage: PausePanel["usage"]): string[] {
  const lines: string[] = [];
  if (limits.maxPauseDaysTotal != null) {
    lines.push(`${usage.daysUsed} of ${limits.maxPauseDaysTotal} vacation days used`);
  }
  if (limits.maxPauses != null) {
    const remaining = Math.max(limits.maxPauses - usage.count, 0);
    lines.push(`${remaining} vacation${remaining === 1 ? "" : "s"} left`);
  }
  if (limits.maxPauseStretchDays != null) {
    lines.push(`Up to ${limits.maxPauseStretchDays} consecutive days per vacation`);
  }
  return lines;
}

export function cutoffByDateFromDeliveries(deliveries: CustomerDelivery[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of deliveries) {
    if (d.cutoffAt != null) map.set(d.deliveryDate, d.cutoffAt);
  }
  return map;
}

type VacationStep = "form" | "confirm";
type ActiveDatePicker = "start" | "end" | null;

export function VacationControl({
  sub,
  pausePanel,
  cutoffByDate,
  today,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: {
  sub: Subscription;
  pausePanel: PausePanel;
  cutoffByDate: Map<string, number>;
  today: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [step, setStep] = useState<VacationStep>("form");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [activePicker, setActivePicker] = useState<ActiveDatePicker>(null);
  const [pausePending, startPauseTransition] = useTransition();
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [resumePending, startResumeTransition] = useTransition();
  const [resumeError, setResumeError] = useState<string | null>(null);

  const onVacation = pausePanel.usage.hasOpenPause || sub.status === "paused";
  const { limits, usage } = pausePanel;
  const budgetLines = pauseBudgetLines(limits, usage);
  const endDateRequired = vacationRequiresEndDate(limits.maxPauseStretchDays);
  const openEndedVacation = !endDate;

  function resetForm() {
    setStep("form");
    setStartDate("");
    setEndDate("");
    setActivePicker(null);
    setPauseError(null);
  }

  function isLockedDate(iso: string): boolean {
    if (iso < today) return true;
    const cutoff = cutoffByDate.get(iso);
    return cutoff != null && Date.now() > cutoff;
  }

  function validateVacation(fromIso: string, untilIso: string, indefinite: boolean): string | null {
    if (!fromIso) return "Start date is required";
    if (fromIso < today) return "Start date cannot be in the past";
    if (isLockedDate(fromIso)) return "Start date is past the order cutoff";
    if (endDateRequired && !endDate) return "This plan requires an end date for vacation";
    if (!indefinite && untilIso < fromIso) return "End date must be on or after the start date";
    if (!indefinite) {
      for (let cursor = fromIso; cursor <= untilIso; ) {
        if (isLockedDate(cursor)) return "One or more days in this range are past the order cutoff";
        const next = new Date(`${cursor}T12:00:00`);
        next.setDate(next.getDate() + 1);
        cursor = next.toISOString().slice(0, 10);
      }
    }
    return null;
  }

  const canContinue =
    !!startDate &&
    (!endDate || endDate >= startDate) &&
    (!endDateRequired || !!endDate);

  function goToConfirm() {
    if (!startDate) return;
    setPauseError(null);
    const request = buildVacationPauseRequest(startDate, endDate);
    const validationError = validateVacation(request.from, request.until, request.indefinite ?? false);
    if (validationError) {
      setPauseError(validationError);
      return;
    }
    setStep("confirm");
  }

  function submitVacation() {
    if (!startDate) return;
    setPauseError(null);
    const request = buildVacationPauseRequest(startDate, endDate);
    const validationError = validateVacation(request.from, request.until, request.indefinite ?? false);
    if (validationError) {
      setPauseError(validationError);
      setStep("form");
      return;
    }
    startPauseTransition(async () => {
      try {
        await pauseMySubscription(sub.publicId, request);
        router.refresh();
        resetForm();
        setOpen(false);
      } catch (e) {
        setPauseError(e instanceof Error ? e.message : "Failed to start vacation");
        setStep("confirm");
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
        setResumeError(e instanceof Error ? e.message : "Failed to resume deliveries");
      }
    });
  }

  function isDisabledDay(date: Date): boolean {
    const iso = toIsoLocal(date);
    return isLockedDate(iso);
  }

  const endMin = startDate || today;

  function selectStartDate(iso: string) {
    setStartDate(iso);
    if (endDate && iso > endDate) setEndDate("");
  }
  const dialogTitle = onVacation
    ? "Resume deliveries"
    : step === "confirm"
      ? "Confirm vacation"
      : "Plan a vacation";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
      trigger={
        hideTrigger ? undefined : (
          <Button variant={onVacation ? "secondary" : "outline"} size="sm">
            {onVacation ? (
              <PlayIcon data-icon="inline-start" />
            ) : (
              <PalmtreeIcon data-icon="inline-start" />
            )}
            {onVacation ? "Resume" : "Vacation"}
          </Button>
        )
      }
      title={dialogTitle}
      description={sub.planName}
    >
      <div className="space-y-4 px-4 pb-4 sm:px-0 sm:pb-0">
        {onVacation ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Deliveries are paused for this plan. Resume when you are ready for meals again.
            </p>
            <Button disabled={resumePending} onClick={submitResume}>
              <PlayIcon data-icon="inline-start" /> Resume deliveries
            </Button>
            {resumeError && <p className="text-bad text-xs">{resumeError}</p>}
          </div>
        ) : step === "form" ? (
          <div className="space-y-4">
            {budgetLines.length > 0 && (
              <ul className="text-muted-foreground text-xs">
                {budgetLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <VacationDateField
                id="vacation-start"
                label="Start date"
                value={startDate}
                onChange={selectStartDate}
                today={today}
                isDisabledDay={isDisabledDay}
                open={activePicker === "start"}
                onOpenChange={(next) => setActivePicker(next ? "start" : null)}
              />
              <VacationDateField
                id="vacation-end"
                label="End date"
                optionalHint={endDateRequired ? undefined : " (optional)"}
                value={endDate}
                onChange={setEndDate}
                today={today}
                minDate={endMin}
                isDisabledDay={isDisabledDay}
                open={activePicker === "end"}
                onOpenChange={(next) => setActivePicker(next ? "end" : null)}
              />
            </div>
            {startDate && (
              <p className="text-muted-foreground text-sm">
                {openEndedVacation
                  ? `Without an end date, all upcoming deliveries pause from ${formatDateOnly(startDate, { mode: "short" })} until you resume.`
                  : `Deliveries pause from ${formatDateOnly(startDate, { mode: "short" })} through ${formatDateOnly(endDate, { mode: "short" })}.`}
              </p>
            )}
            <Button variant="secondary" disabled={!canContinue} onClick={goToConfirm}>
              Continue
            </Button>
            {pauseError && <p className="text-bad text-xs">{pauseError}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm">{vacationSummaryMessage(startDate, endDate)}</p>
            <div className="bg-muted/50 rounded-lg border px-3 py-2.5 text-sm">
              <p className="font-medium">{sub.planName}</p>
              <p className="text-muted-foreground mt-1">
                {openEndedVacation
                  ? `From ${formatDateOnly(startDate, { mode: "long" })} · until you resume`
                  : `${formatDateOnly(startDate, { mode: "long" })} → ${formatDateOnly(endDate, { mode: "long" })}`}
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={pausePending} onClick={() => setStep("form")}>
                Go back
              </Button>
              <Button disabled={pausePending} onClick={submitVacation}>
                <PalmtreeIcon data-icon="inline-start" /> Confirm vacation
              </Button>
            </div>
            {pauseError && <p className="text-bad text-xs">{pauseError}</p>}
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
