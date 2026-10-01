/* eslint-disable */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Invoice } from "./invoice";
import { PlanSummary } from "./plan-summary";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { PricingResult } from "@/lib/pricing";
import { reprice } from "@/app/(public)/subscribe/actions";
import { BottomBar, Button, Sheet } from "@/components/customer/kit";
import { trialSendDays } from "@/lib/trial/schedule";
import { adjacentWizardStep, initialSelections, nextBlockedReason, selectionIsTrial, servesWeekends, WIZARD_ORIGIN_KEY, WIZARD_STEP_KEY, WIZARD_STORAGE_KEY, type WizardOrigin, type WizardSelections } from "./selections";
import { StepBaseline } from "./steps/step-baseline";
import { StepBundle } from "./steps/step-bundle";
import { StepSchedule } from "./steps/step-schedule";
import { StepDuration } from "./steps/step-duration";
import { BestDeal } from "./best-deal";
import { SubscribeChrome } from "./subscribe-chrome";
import { Progress } from "./progress";
import { TotalChip } from "./total-chip";
import { anySameIsoWeek } from "./same-iso-week";
import type { CurrentPlanSummary } from "./current-plan-hint";

const STEPS = ["Baseline", "Bundle", "Schedule", "Start"] as const;
const QUESTIONS = ["What's your baseline?", "Pick your bundle.", "Set your schedule.", "Start date & commitment."] as const;

export function Wizard({
  catalog,
  closeHref,
  existingStartDates = [],
  currentPlan = null,
  origin = "subscribe",
  initial = initialSelections,
  minStartDate = null,
  exitHref,
  trial = null,
}: {
  catalog: ClientCatalogSnapshot;
  closeHref: string;
  existingStartDates?: string[];
  currentPlan?: CurrentPlanSummary | null;
  origin?: WizardOrigin;
  initial?: WizardSelections;
  /** First date a new/renewed plan may start (overlap with a live plan). */
  minStartDate?: string | null;
  exitHref?: string;
  /** Open trial offer. Trial sizes then sit on Bundle and skip Schedule. */
  trial?: { maxDays: number; weekdays: string[] } | null;
}) {
  const router = useRouter();
  const [step, setStepState] = useState(0);
  const setStep = (n: number | ((s: number) => number)) =>
    setStepState((s) => {
      const next = typeof n === "function" ? n(s) : n;
      try { sessionStorage.setItem(WIZARD_STEP_KEY, String(next)); } catch { /* storage unavailable */ }
      return next;
    });
  const [selections, setSelections] = useState<WizardSelections>(initial);
  const [result, setResult] = useState<PricingResult | null>(null);
  const prevStep = useRef(0);
  const direction = step >= prevStep.current ? "forward" : "back";
  useEffect(() => {
    if (prevStep.current !== step) window.scrollTo({ top: 0 });
    prevStep.current = step;
  }, [step]);

  // "Edit plan" from checkout lands here again: restore what the customer had picked and the step they were on.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(WIZARD_ORIGIN_KEY) !== origin) return;
      const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as WizardSelections;
      if (saved.planKey != null && !catalog.plans.some((p) => p.key === saved.planKey)) return;
      let savedStep = Number(sessionStorage.getItem(WIZARD_STEP_KEY));
      const savedTrial = trial != null && catalog.mealSizes.some((m) => m.publicId === saved.mealSizeId && m.trial);
      if (savedTrial && savedStep === 2) savedStep = 3;
      /* eslint-disable react-hooks/set-state-in-effect */
      setSelections({ ...initial, ...saved });
      if (Number.isInteger(savedStep) && savedStep >= 0 && savedStep < STEPS.length) {
        prevStep.current = savedStep;
        setStepState(savedStep);
      }
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch { /* unreadable saved plan: start fresh */ }
    // Mount-only restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<WizardSelections>) => setSelections((s) => ({ ...s, ...patch }));

  useEffect(() => {
    // Clearing the stale invoice when no meal is chosen; intentional effect-driven reset.
     
    // No frequency until the Schedule step: pricing would throw "Invalid frequency" (a 500) on every Bundle pick.
    const trialPick = trial != null && selectionIsTrial(catalog, selections);
    if (!selections.mealSizeId || (trialPick ? selections.trialDays == null || !selections.startDate : !selections.frequencyKey)) { setTimeout(() => setResult(null), 0); return; }
    let active = true;
    reprice(selections, undefined, selections.planKey ?? undefined)
      .then((r) => { if (active) setResult(r.pricing); })
      .catch(() => { if (active) setResult(null); });
    return () => { active = false; };
  }, [selections, trial, catalog]);

  const blocked = nextBlockedReason(step, catalog, selections);
  const canNext = blocked === null;

  const deploy = () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    sessionStorage.setItem(WIZARD_ORIGIN_KEY, origin);
    router.push("/checkout", { transitionTypes: ["nav-forward"] });
  };

  const sameWeekConflict =
    selections.startDate !== "" && anySameIsoWeek(selections.startDate, existingStartDates);

  const trialSelected = trial != null && selectionIsTrial(catalog, selections);
  const stepLabels = trialSelected ? (["Baseline", "Bundle", "Start"] as const) : STEPS;
  const questions = trialSelected
    ? (["What's your baseline?", "Pick your bundle.", "When should the trial start?"] as const)
    : QUESTIONS;
  const progressIndex = trialSelected ? (step <= 1 ? step : 2) : step;

  const goBack = () => {
    const prev = adjacentWizardStep(step, -1, trialSelected);
    if (prev >= 0 && prev < step) {
      setStep(prev);
      return;
    }
    if (exitHref) router.push(exitHref, { transitionTypes: ["nav-back"] });
    else router.back();
  };

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const reduce = useReducedMotion();
  const slide = reduce ? 0 : 24;
  const sign = direction === "forward" ? 1 : -1;
  const spring = reduce ? { duration: 0.15 } : { type: "spring" as const, bounce: 0, duration: 0.4 };

  return (
    <div className="pb-44 sm:pb-6">
      <SubscribeChrome closeHref={closeHref} onBack={goBack} stepTag={stepLabels[progressIndex]}
        trailing={result ? <TotalChip tiffinCount={result.tiffinCount} total={result.total} open={invoiceOpen} onOpen={() => setInvoiceOpen(true)} /> : null}
      />

      <Progress steps={stepLabels} current={progressIndex} />

      {step >= 1 && step <= 3 && !trialSelected && <BestDeal key={step} vary={step === 1 ? "bundle" : step === 2 ? "frequency" : "duration"} catalog={catalog} selections={selections} set={set} />}

      <AnimatePresence mode="popLayout" initial={false} custom={sign}>
        <motion.div
          key={step}
          custom={sign}
          initial={{ opacity: 0, x: slide * sign }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -slide * sign }}
          transition={spring}
        >
          <h2 className="mb-6 text-[34px] leading-[1.06] font-bold tracking-[-0.03em] text-balance sm:text-[40px]">{questions[progressIndex]}</h2>

          {step === 0 && <StepBaseline catalog={catalog} selections={selections} set={set} currentPlan={currentPlan} />}
          {step === 1 && <StepBundle catalog={catalog} selections={selections} set={set} currentPlan={currentPlan} trial={trial} />}
          {step === 2 && !trialSelected && <StepSchedule catalog={catalog} selections={selections} set={set} currentPlan={currentPlan} />}
          {step === 3 && (
            <StepDuration
              catalog={catalog}
              selections={selections}
              set={set}
              result={result}
              sameWeekConflict={sameWeekConflict}
              currentPlan={currentPlan}
              minStartDate={minStartDate}
              trial={trialSelected && trial ? { ...trial, weekdays: trialSendDays(trial.weekdays, servesWeekends(catalog, selections)) } : null}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <Sheet bottom open={invoiceOpen && result != null} onClose={() => setInvoiceOpen(false)} title="Price summary">
        {result && (
          <div className="space-y-3 pb-3">
            <PlanSummary
              baseline={catalog.plans.find((p) => p.key === selections.planKey)?.name}
              mealName={catalog.mealSizes.find((m) => m.publicId === selections.mealSizeId)?.name}
              deliveryName={catalog.frequencies.find((f) => f.key === selections.frequencyKey)?.name}
              eatingDays={selections.eatingDays ?? []}
              weeks={selections.durationWeeks}
              startDate={selections.startDate}
              tiffinCount={result.tiffinCount}
            />
            <Invoice result={result} />
          </div>
        )}
      </Sheet>

      <BottomBar alignEnd note={blocked ?? undefined} className="sm:sticky sm:mt-6 sm:px-0">
        <Button variant="quiet" size="lg" className="w-24 shrink-0 sm:hidden" onClick={goBack}>Back</Button>
        {step < 3 ? (
          <Button variant="primary" size="lg" className="flex-1 sm:min-h-10 sm:flex-none sm:px-8" disabled={!canNext} onClick={() => setStep(adjacentWizardStep(step, 1, trialSelected))}>Next</Button>
        ) : (
          <Button variant="primary" size="lg" className="flex-1 sm:min-h-10 sm:flex-none sm:px-8" disabled={!canNext} onClick={deploy}>
            Continue to checkout
          </Button>
        )}
      </BottomBar>
    </div>
  );
}
