"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { PricingResult } from "@/lib/pricing";
import { reprice } from "@/app/(public)/subscribe/actions";
import { Button } from "@/components/ui/button";
import { initialSelections, WIZARD_STORAGE_KEY, type EnabledSlot, type WizardSelections } from "./selections";
import { StepBaseline } from "./steps/step-baseline";
import { StepBundle } from "./steps/step-bundle";
import { StepSchedule } from "./steps/step-schedule";
import { StepDuration } from "./steps/step-duration";

const STEPS = ["Baseline", "Bundle", "Schedule", "Duration"] as const;

export function Wizard({ catalog, enabledSlots }: { catalog: ClientCatalogSnapshot; enabledSlots: EnabledSlot[] }) {
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
    reprice(selections).then((r) => { if (active) setResult(r); }).catch(() => { if (active) setResult(null); });
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
      <ol className="flex gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className={`rounded-full px-3 py-1 ${i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && <StepBaseline catalog={catalog} selections={selections} set={set} />}
      {step === 1 && <StepBundle catalog={catalog} selections={selections} set={set} />}
      {step === 2 && <StepSchedule catalog={catalog} selections={selections} set={set} enabledSlots={enabledSlots} />}
      {step === 3 && <StepDuration catalog={catalog} selections={selections} set={set} result={result} />}

      <div className="flex justify-between">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
        {step < 3
          ? <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next</Button>
          : <Button disabled={!selections.mealSizeId} onClick={deploy}>Deploy Plan Formulation</Button>}
      </div>
    </div>
  );
}
