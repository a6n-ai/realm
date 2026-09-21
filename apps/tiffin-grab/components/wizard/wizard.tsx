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
import { initialSelections, nextBlockedReason, WIZARD_ORIGIN_KEY, WIZARD_STEP_KEY, WIZARD_STORAGE_KEY, type WizardOrigin, type WizardSelections } from "./selections";
import { StepBaseline } from "./steps/step-baseline";
import { StepBundle } from "./steps/step-bundle";
import { StepSchedule } from "./steps/step-schedule";
import { StepDuration } from "./steps/step-duration";
import { BestDeal } from "./best-deal";
import { SubscribeChrome } from "./subscribe-chrome";
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
      const savedStep = Number(sessionStorage.getItem(WIZARD_STEP_KEY));
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    // No frequency until the Schedule step: pricing would throw "Invalid frequency" (a 500) on every Bundle pick.
    if (!selections.mealSizeId || !selections.frequencyKey) { setResult(null); return; }
    let active = true;
    reprice(selections, undefined, selections.planKey ?? undefined)
      .then((r) => { if (active) setResult(r.pricing); })
      .catch(() => { if (active) setResult(null); });
    return () => { active = false; };
  }, [selections]);

  const blocked = nextBlockedReason(step, catalog, selections);
  const canNext = blocked === null;

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

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const reduce = useReducedMotion();
  const slide = reduce ? 0 : 24;
  const sign = direction === "forward" ? 1 : -1;
  const spring = reduce ? { duration: 0.15 } : { type: "spring" as const, bounce: 0, duration: 0.4 };

  return (
    <div className="pb-44 sm:pb-6">
      <SubscribeChrome closeHref={closeHref} onBack={goBack} stepTag={STEPS[step]}
        trailing={result ? (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={invoiceOpen}
            aria-label={`Price summary: ${result.tiffinCount} tiffins, $${result.total.toFixed(2)} total`}
            onClick={() => setInvoiceOpen(true)}
            className="bg-primary/15 text-foreground focus-visible:ring-ring flex h-11 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold tabular-nums transition-transform duration-100 outline-none focus-visible:ring-2 active:scale-[0.97] motion-reduce:active:scale-100"
          >
            <span className="text-muted-foreground">{result.tiffinCount}<span> {result.tiffinCount === 1 ? "tiffin" : "tiffins"}</span></span>
            <span className="min-w-[4.5ch] text-right text-[15px]">${result.total.toFixed(2)}</span>
          </button>
        ) : null}
      />

      <nav aria-label="Progress" className="mb-6">
        <ol className="grid grid-cols-4 gap-1.5">
          {STEPS.map((name, i) => (
            <li key={name} aria-current={i === step ? "step" : undefined}>
              <span className={`block h-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-primary" : "bg-border"}`} />
              <span className={`mt-1.5 block truncate text-xs font-semibold ${i === step ? "text-foreground" : "text-muted-foreground"}`}>{name}</span>
            </li>
          ))}
        </ol>
      </nav>

      {step >= 1 && step <= 3 && <BestDeal key={step} vary={step === 1 ? "bundle" : step === 2 ? "frequency" : "duration"} catalog={catalog} selections={selections} set={set} />}

      <AnimatePresence mode="popLayout" initial={false} custom={sign}>
        <motion.div
          key={step}
          custom={sign}
          initial={{ opacity: 0, x: slide * sign }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -slide * sign }}
          transition={spring}
        >
          <h2 className="mb-6 text-[34px] leading-[1.06] font-bold tracking-[-0.03em] text-balance sm:text-[40px]">{QUESTIONS[step]}</h2>

          {step === 0 && <StepBaseline catalog={catalog} selections={selections} set={set} currentPlan={currentPlan} />}
          {step === 1 && <StepBundle catalog={catalog} selections={selections} set={set} currentPlan={currentPlan} />}
          {step === 2 && <StepSchedule catalog={catalog} selections={selections} set={set} currentPlan={currentPlan} />}
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
          <Button variant="primary" size="lg" className="flex-1 sm:min-h-10 sm:flex-none sm:px-8" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next</Button>
        ) : (
          <Button variant="primary" size="lg" className="flex-1 sm:min-h-10 sm:flex-none sm:px-8" disabled={!canNext} onClick={deploy}>
            Continue to checkout
          </Button>
        )}
      </BottomBar>
    </div>
  );
}
