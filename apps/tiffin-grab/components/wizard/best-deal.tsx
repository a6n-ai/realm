"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { CheckIcon, TagIcon, XIcon } from "lucide-react";
import { IconTile } from "@/components/customer/kit";
import { buttonClass } from "@/components/customer/kit/button-class";
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
        <m.section
          key="best-deal"
          aria-label={applied ? copy.appliedTitle : copy.title}
          initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0, y: -8 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto", y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, y: -8 }}
          transition={spring}
          className="overflow-hidden"
        >
          {/* Liquid glass, like the bottom bar: an offer floats over the page instead of tinting a strip of it. */}
          <div className="c-liquid mb-5 flex items-center gap-3 rounded-[22px] py-2.5 pr-1.5 pl-2.5">
            <IconTile tint="green">{applied ? <CheckIcon strokeWidth={3} /> : <TagIcon />}</IconTile>
            <AnimatePresence initial={false} mode="wait">
              <m.div
                key={view.state}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0.1 : 0.18 }}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <p className="min-w-0 flex-1 leading-snug text-pretty">
                  <span className="block text-[15px] font-semibold tracking-[-0.01em]">{applied ? copy.appliedTitle : copy.title}</span>
                  <span className="text-muted-foreground block text-[13px]">{applied ? copy.appliedBody(view.label, view.pct) : copy.body(view.label, view.pct)}</span>
                </p>
                <button
                  type="button"
                  onClick={applied ? revert : apply}
                  className={buttonClass({ variant: applied ? "quiet" : "primary", className: "relative !min-h-9 h-9 shrink-0 !rounded-full !px-4 !text-[13px] before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']" })}
                >
                  {applied ? "Undo" : "Use this"}
                </button>
              </m.div>
            </AnimatePresence>
            <button
              type="button"
              aria-label="Dismiss best deal"
              onClick={() => setDismissed(true)}
              className="text-muted-foreground -ml-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform duration-100 active:scale-[0.9] motion-reduce:active:scale-100"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </m.section>
      )}
    </AnimatePresence>
  );
}
