"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PalmtreeIcon, PlayIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { IOS_BUTTON } from "@/components/customer/ios-button";
import { ResponsiveDialog } from "@/components/ds";
import { formatDateOnly } from "@/lib/format/datetime";
import type { Subscription } from "@/lib/services/customer-deliveries.service";
import type { PausePanel } from "./delivery-calendar";
import { ActionCard, DELIVERY_SHEET_DIRECTION } from "./action-card";
import { pauseMySubscription, resumeMySubscription } from "./actions";
import {
  buildVacationPauseRequest,
  validateVacationDates,
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

type VacationStep = "form" | "confirm";

export function VacationControl({
  sub,
  pausePanel,
  today,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
  layout = "tile",
}: {
  sub: Subscription;
  pausePanel: PausePanel;
  today: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  layout?: "row" | "tile";
}) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [step, setStep] = useState<VacationStep>("form");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pausePending, startPauseTransition] = useTransition();
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [resumePending, startResumeTransition] = useTransition();
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeFromDate, setResumeFromDate] = useState("");

  const onVacation = pausePanel.usage.hasOpenPause || sub.status === "paused";
  const { limits, usage } = pausePanel;
  const budgetLines = pauseBudgetLines(limits, usage);
  const endDateRequired = vacationRequiresEndDate(limits.maxPauseStretchDays);
  const openEndedVacation = !endDate;

  function resetForm() {
    setStep("form");
    setStartDate("");
    setEndDate("");
    setPauseError(null);
  }

  function validateVacation(fromIso: string, untilIso: string, indefinite: boolean): string | null {
    return validateVacationDates({
      from: fromIso,
      until: untilIso,
      indefinite,
      today,
      endDateRequired,
      endDate,
    });
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
        await resumeMySubscription(sub.publicId, resumeFromDate || undefined);
        router.refresh();
        setResumeFromDate("");
        setOpen(false);
      } catch (e) {
        setResumeError(e instanceof Error ? e.message : "Failed to resume deliveries");
      }
    });
  }

  function selectStartDate(iso: string) {
    setStartDate(iso);
    if (endDate && iso > endDate) setEndDate("");
  }

  const endMin = startDate || today;
  const dialogTitle = onVacation
    ? "Resume deliveries"
    : step === "confirm"
      ? "Confirm vacation"
      : "Plan a vacation";

  const footer = onVacation ? (
    <Button className={IOS_BUTTON} disabled={resumePending} onClick={submitResume}>
      <PlayIcon data-icon="inline-start" />
      {resumeFromDate ? "Resume from this day" : "Resume all deliveries"}
    </Button>
  ) : step === "form" ? (
    <Button className={IOS_BUTTON} disabled={!canContinue} onClick={goToConfirm}>
      Continue
    </Button>
  ) : (
    <div className="flex w-full flex-col-reverse gap-2.5 sm:flex-row">
      <Button type="button" variant="secondary" className={IOS_BUTTON} disabled={pausePending} onClick={() => setStep("form")}>
        Go back
      </Button>
      <Button className={IOS_BUTTON} disabled={pausePending} onClick={submitVacation}>
        <PalmtreeIcon data-icon="inline-start" /> Confirm vacation
      </Button>
    </div>
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
      direction={DELIVERY_SHEET_DIRECTION}
      trigger={
        hideTrigger ? undefined : (
          <ActionCard
            layout={layout}
            icon={onVacation ? PlayIcon : PalmtreeIcon}
            title={onVacation ? "Resume" : "Vacation"}
            aria-label={onVacation ? "Resume deliveries" : "Plan a vacation"}
            description={
              onVacation
                ? "Start this plan again"
                : "Pause for a trip"
            }
          />
        )
      }
      title={dialogTitle}
      description={sub.mealSizeName}
      footer={footer}
    >
      <div className="space-y-4 px-4 pb-4">
        {onVacation ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Deliveries are paused for this plan. Resume everything now, or pick a day to resume
              from — paused days before that day move to your remain pool to reschedule later.
            </p>
            <VacationDateField
              id="resume-from"
              label="Resume from"
              optionalHint=" (optional)"
              value={resumeFromDate}
              onChange={setResumeFromDate}
              today={today}
              minDate={today}
            />
            {resumeFromDate && (
              <p className="text-muted-foreground text-sm">
                Deliveries resume on {formatDateOnly(resumeFromDate, { mode: "long" })}. Paused days
                before it become tiffins you can schedule after your last delivery.
              </p>
            )}
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
                minDate={today}
              />
              <VacationDateField
                id="vacation-end"
                label="End date"
                optionalHint={endDateRequired ? undefined : " (optional)"}
                value={endDate}
                onChange={setEndDate}
                today={today}
                minDate={endMin}
              />
            </div>
            {startDate && (
              <p className="text-muted-foreground text-sm">
                {openEndedVacation
                  ? `Without an end date, all upcoming deliveries pause from ${formatDateOnly(startDate, { mode: "short" })} until you resume.`
                  : `Deliveries pause from ${formatDateOnly(startDate, { mode: "short" })} through ${formatDateOnly(endDate, { mode: "short" })}.`}
              </p>
            )}
            {pauseError && <p className="text-bad text-xs">{pauseError}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm">{vacationSummaryMessage(startDate, endDate)}</p>
            <div className="bg-muted/50 rounded-lg border px-3 py-2.5 text-sm">
              <p className="font-medium">{sub.mealSizeName}</p>
              <p className="text-muted-foreground mt-1">
                {openEndedVacation
                  ? `From ${formatDateOnly(startDate, { mode: "long" })} · until you resume`
                  : `${formatDateOnly(startDate, { mode: "long" })} → ${formatDateOnly(endDate, { mode: "long" })}`}
              </p>
            </div>
            {pauseError && <p className="text-bad text-xs">{pauseError}</p>}
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
