"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { PricingResult } from "@/lib/pricing";
import { reprice } from "@/app/(public)/subscribe/actions";
import { Button } from "@realm/ui/button";
import { Stepper } from "@/components/stepper";
import { initialSelections, WIZARD_ORIGIN_KEY, WIZARD_STORAGE_KEY, type WizardSelections } from "./selections";
import { StepBaseline } from "./steps/step-baseline";
import { StepBundle } from "./steps/step-bundle";
import { StepSchedule } from "./steps/step-schedule";
import { StepDuration } from "./steps/step-duration";
import { SubscribeChrome } from "./subscribe-chrome";
import { anySameIsoWeek } from "./same-iso-week";
import type { CurrentPlanSummary } from "./current-plan-hint";

const STEPS = ["Baseline", "Bundle", "Schedule", "Start & duration"] as const;

export function Wizard({
  catalog,
  closeHref,
  existingStartDates = [],
  currentPlan = null,
}: {
  catalog: ClientCatalogSnapshot;
  closeHref: string;
  existingStartDates?: string[];
  currentPlan?: CurrentPlanSummary | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<WizardSelections>(initialSelections);
  const [result, setResult] = useState<PricingResult | null>(null);

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
    sessionStorage.setItem(WIZARD_ORIGIN_KEY, "subscribe");
    router.push("/checkout");
  };

  const sameWeekConflict =
    selections.startDate !== "" && anySameIsoWeek(selections.startDate, existingStartDates);

  return (
    <div className="space-y-5 pb-24 sm:pb-6">
      <SubscribeChrome
        closeHref={closeHref}
        onBack={() => (step > 0 ? setStep((s) => s - 1) : router.back())}
      />

      <Stepper steps={STEPS} currentIndex={step} compactLabels />

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
        />
      )}

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
            <Button type="button" size="lg" className="w-full sm:w-auto" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              className="w-full sm:w-auto"
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
