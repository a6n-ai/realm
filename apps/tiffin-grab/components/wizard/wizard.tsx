"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { PricingResult } from "@/lib/pricing";
import { reprice } from "@/app/(public)/subscribe/actions";
import { Button } from "@realm/ui/button";
import { ArrowLeftIcon, Check } from "lucide-react";
import { initialSelections, WIZARD_STORAGE_KEY, type WizardSelections } from "./selections";
import { StepBaseline } from "./steps/step-baseline";
import { StepBundle } from "./steps/step-bundle";
import { StepSchedule } from "./steps/step-schedule";
import { StepDuration } from "./steps/step-duration";

const STEPS = ["Baseline", "Bundle", "Schedule", "Start & duration"] as const;

export function Wizard({ catalog }: { catalog: ClientCatalogSnapshot }) {
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
    // Pass the plan key so plan-restricted auto-apply coupons resolve; the wizard
    // invoice then reflects any auto-applied festival/launch discount live.
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
    router.push("/checkout");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => (step > 0 ? setStep((s) => s - 1) : router.back())}
        >
          <ArrowLeftIcon data-icon="inline-start" /> Back
        </Button>
      </div>
      <ol className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 text-xs sm:mx-0 sm:px-0 [scrollbar-width:none]">
        {STEPS.map((label, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={label} className="flex shrink-0 items-center gap-1">
              <span className="flex items-center gap-1.5">
                <span
                  className={`flex size-5 items-center justify-center rounded-full text-[11px] font-medium transition-colors ${
                    done || current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                <span className={`whitespace-nowrap ${current ? "font-medium text-foreground" : "text-muted-foreground"}`}>{label}</span>
              </span>
              {i < STEPS.length - 1 && <span aria-hidden className="mx-1 h-px w-4 shrink-0 bg-border sm:w-6" />}
            </li>
          );
        })}
      </ol>

      {step === 0 && <StepBaseline catalog={catalog} selections={selections} set={set} />}
      {step === 1 && <StepBundle catalog={catalog} selections={selections} set={set} />}
      {step === 2 && <StepSchedule catalog={catalog} selections={selections} set={set} />}
      {step === 3 && <StepDuration catalog={catalog} selections={selections} set={set} result={result} />}

      <div className="flex justify-between gap-2">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
        {step < 3
          ? <Button size="lg" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next</Button>
          : <Button size="lg" disabled={!selections.mealSizeId || !selections.startDate} onClick={deploy}>Continue to checkout</Button>}
      </div>
    </div>
  );
}
