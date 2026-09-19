"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2Icon, XIcon } from "lucide-react";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { BEST_DEAL_COPY } from "./best-deal-copy";
import { bundleDeal, frequencyOrDurationDeal } from "./best-deal-state";
import type { WizardSelections } from "./selections";

type Vary = "bundle" | "frequency" | "duration";
type Set = (patch: Partial<WizardSelections>) => void;

// Remount per wizard step (key={step}) so dismissal lasts only until the step changes.
export function BestDeal({ catalog, selections, set, vary }: { vary: Vary; catalog: ClientCatalogSnapshot; selections: WizardSelections; set: Set }) {
  const [dismissed, setDismissed] = useState(false);
  const undo = useRef<Partial<WizardSelections> | null>(null);
  const reduce = useReducedMotion();
  const copy = BEST_DEAL_COPY[vary];

  const view = useMemo(() => {
    if (vary === "bundle") {
      const b = bundleDeal(catalog, selections);
      if (b.state === "none") return null;
      return { state: b.state, label: b.meal.name, pct: b.pct, apply: { mealSizeId: b.meal.publicId } as Partial<WizardSelections>, fallback: { mealSizeId: "" } as Partial<WizardSelections> };
    }
    const c = frequencyOrDurationDeal(catalog, selections, vary);
    if (c.state === "none") return null;
    const target = c.deal.payload;
    const key = (p: typeof target): Partial<WizardSelections> => (vary === "frequency" ? { frequencyKey: p.frequencyKey } : { durationWeeks: p.durationWeeks });
    return { state: c.state, label: c.deal.label, pct: Math.round(c.deal.savingPct), apply: key(target), fallback: c.state === "applied" ? key(c.least) : {} };
  }, [vary, catalog, selections]);

  const apply = () => {
    if (!view) return;
    undo.current = Object.fromEntries(Object.keys(view.apply).map((k) => [k, selections[k as keyof WizardSelections]]));
    set(view.apply);
  };
  const revert = () => {
    if (!view) return;
    set(undo.current ?? view.fallback);
    undo.current = null;
  };

  const applied = view?.state === "applied";
  const spring = reduce ? { duration: 0.15 } : { type: "spring" as const, bounce: 0, duration: 0.4 };

  return (
    <AnimatePresence initial={false}>
      {view && !dismissed && (
        <motion.section
          key="best-deal"
          aria-label={applied ? copy.appliedTitle : copy.title}
          initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0, y: -8 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto", y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, y: -8 }}
          transition={spring}
          className="overflow-hidden"
        >
          <div className={`mb-6 flex items-start gap-3 rounded-[20px] border p-4 transition-colors duration-300 ${applied ? "border-emerald-500/40 bg-emerald-500/10" : "border-primary/30 bg-primary/10"}`}>
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={view.state}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0.1 : 0.18 }}
                className="flex min-w-0 flex-1 items-start gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className={`flex items-center gap-1.5 text-[13px] font-semibold tracking-[0.02em] ${applied ? "text-emerald-600 dark:text-emerald-400" : "text-primary"}`}>
                    {applied && <CheckCircle2Icon aria-hidden className="size-4 shrink-0" />}
                    {applied ? copy.appliedTitle : copy.title}
                  </p>
                  <p className="mt-1 text-[15px] leading-snug text-pretty">{applied ? copy.appliedBody(view.label, view.pct) : copy.body(view.label, view.pct)}</p>
                  <button
                    type="button"
                    onClick={applied ? revert : apply}
                    className={`mt-3 h-11 cursor-pointer rounded-full px-5 text-sm font-semibold transition-[transform,background-color,color] duration-100 active:scale-[0.97] motion-reduce:active:scale-100 ${applied ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950" : "bg-primary text-primary-foreground"}`}
                  >
                    {applied ? "Undo" : "Use this"}
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
            <button
              type="button"
              aria-label="Dismiss best deal"
              onClick={() => setDismissed(true)}
              className="text-muted-foreground -m-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform duration-100 active:scale-[0.9] motion-reduce:active:scale-100"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

// One pill per card: the discount when there is one ("Save 10%", green and "· Selected" once chosen),
// otherwise the plain recommendation marker. onPrimary: the pill sits on a filled primary surface,
// where green-on-orange is unreadable.
export function BestPill({ selected, onPrimary = false, save = 0 }: { selected: boolean; onPrimary?: boolean; save?: number }) {
  const label = save > 0 ? `Save ${save}%${selected ? " · Selected" : ""}` : selected ? "Selected · best deal" : "Recommended";
  return (
    <span aria-label={save > 0 ? `Save ${save}%` : undefined} className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors duration-300 ${onPrimary ? "bg-primary-foreground/20 text-primary-foreground" : selected ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-primary/15 text-primary"}`}>
      {label}
    </span>
  );
}
