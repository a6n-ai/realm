"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { PricingResult } from "@/lib/pricing";
import { reprice } from "@/app/(public)/subscribe/actions";
import { Button } from "@foundry/ui/button";
import { IOS_BUTTON } from "@/components/customer/ios-button";
import { initialSelections, WIZARD_ORIGIN_KEY, WIZARD_STORAGE_KEY, type WizardOrigin, type WizardSelections } from "./selections";
import { StepBaseline } from "./steps/step-baseline";
import { StepBundle } from "./steps/step-bundle";
import { StepSchedule } from "./steps/step-schedule";
import { StepDuration } from "./steps/step-duration";
import { SubscribeChrome } from "./subscribe-chrome";
import { anySameIsoWeek } from "./same-iso-week";
import type { CurrentPlanSummary } from "./current-plan-hint";

const STEPS = ["Baseline", "Bundle", "Schedule", "Start & duration"] as const;
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
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<WizardSelections>(initial);
  const [result, setResult] = useState<PricingResult | null>(null);
  const prevStep = useRef(0);
  const direction = step >= prevStep.current ? "forward" : "back";
  useEffect(() => { prevStep.current = step; }, [step]);

  const set = (patch: Partial<WizardSelections>) => setSelections((s) => ({ ...s, ...patch }));

  useEffect(() => {
    // Clearing the stale invoice when no meal is chosen; intentional effect-driven reset.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selections.mealSizeId) { setResult(null); return; }
    let active = true;
    reprice(selections, undefined, selections.planKey ?? undefined)
      .then((r) => { if (active) setResult(r.pricing); })
      .catch(() => { if (active) setResult(null); });
    return () => { active = false; };
  }, [selections]);

  const canNext =
    (step === 0 && selections.planKey != null) ||
    (step === 1 && selections.mealSizeId !== "") ||
    step === 2 ||
    step === 3;

  const deploy = () => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    sessionStorage.setItem(WIZARD_ORIGIN_KEY, origin);
    router.push("/checkout");
  };

  const sameWeekConflict =
    selections.startDate !== "" && anySameIsoWeek(selections.startDate, existingStartDates);

  const goBack = () => {
    if (step > 0) {
      setStep((s) => s - 1);
      return;
    }
    if (exitHref) router.push(exitHref);
    else router.back();
  };

  return (
    <div className="space-y-5 pb-24 sm:pb-6">
      <SubscribeChrome
        closeHref={closeHref}
        onBack={goBack}
        stepTag={STEPS[step]}
      />

      <div key={step} className="wizard-step-enter" data-direction={direction}>
        <div className="mb-6 flex items-baseline gap-3.5">
          <span className="text-[clamp(44px,7vw,72px)] leading-none font-bold tracking-[-3px] text-transparent [-webkit-text-stroke:2px_var(--color-primary)]">
            {String(step + 1).padStart(2, "0")}
          </span>
          <span className="text-xs font-semibold text-muted-foreground">/ 0{STEPS.length}</span>
        </div>
        <h1 className="mb-6 text-[clamp(28px,5vw,50px)] leading-[1.05] font-bold tracking-[-1.5px]">{QUESTIONS[step]}</h1>

        {step === 0 && (
          <StepBaseline catalog={catalog} selections={selections} set={set} currentPlan={currentPlan} />
        )}
        {step === 1 && (
          <StepBundle catalog={catalog} selections={selections} set={set} currentPlan={currentPlan} />
        )}
        {step === 2 && (
          <StepSchedule catalog={catalog} selections={selections} set={set} currentPlan={currentPlan} />
        )}
        {step === 3 && (
          <StepDuration
            catalog={catalog}
            selections={selections}
            set={set}
            result={result}
            sameWeekConflict={sameWeekConflict}
            currentPlan={currentPlan}
            minStartDate={minStartDate}
          />
        )}
      </div>
      <style>{`
        @keyframes wizardStepForward{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}
        @keyframes wizardStepBack{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:none}}
        .wizard-step-enter[data-direction="forward"]{animation:wizardStepForward .28s cubic-bezier(.22,1,.36,1) both}
        .wizard-step-enter[data-direction="back"]{animation:wizardStepBack .28s cubic-bezier(.22,1,.36,1) both}
        @media (prefers-reduced-motion: reduce){.wizard-step-enter{animation:none!important}}
      `}</style>

      <div
        className="bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-3xl justify-end gap-2 sm:justify-between">
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="hidden sm:inline-flex"
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          {step < 3 ? (
            <Button type="button" className={`${IOS_BUTTON} sm:h-9 sm:min-h-9 sm:w-auto sm:rounded-lg sm:text-sm`} disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          ) : (
            <Button
              type="button"
              className={`${IOS_BUTTON} sm:h-9 sm:min-h-9 sm:w-auto sm:rounded-lg sm:text-sm`}
              disabled={!selections.mealSizeId || !selections.startDate}
              onClick={deploy}
            >
              Continue to checkout
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
