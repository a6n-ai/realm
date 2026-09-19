"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { XIcon } from "lucide-react";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { defaultEatingDays, type DayOfWeek } from "@/lib/menu/delivery-days";
import { recommendDeals } from "@/lib/pricing/recommend";
import { scheduleError, tiffinBounds, type WizardSelections } from "./selections";

export function BestDeal({ catalog, selections, set }: { catalog: ClientCatalogSnapshot; selections: WizardSelections; set: (patch: Partial<WizardSelections>) => void }) {
  const [dismissed, setDismissed] = useState(false);
  const reduce = useReducedMotion();
  const ready = selections.mealSizeId !== "" && selections.frequencyKey !== "" && scheduleError(catalog, selections) === null;
  const deal = useMemo(() => (ready ? (recommendDeals({ snapshot: catalog, selections })[0] ?? null) : null), [ready, catalog, selections]);
  const show = !dismissed && deal !== null;

  const apply = () => {
    if (!deal) return;
    const { frequencyKey, durationWeeks } = deal.payload;
    const patch: Partial<WizardSelections> = { frequencyKey, durationWeeks };
    if (frequencyKey !== selections.frequencyKey) {
      const max = tiffinBounds(catalog).max;
      const from = catalog.frequencies.find((f) => f.key === selections.frequencyKey);
      const to = catalog.frequencies.find((f) => f.key === frequencyKey);
      const untouched = from != null && (selections.eatingDays ?? []).join() === defaultEatingDays(from.weekdays as DayOfWeek[], max).join();
      if (untouched && to) {
        const days = defaultEatingDays(to.weekdays as DayOfWeek[], max);
        Object.assign(patch, { eatingDays: days, includeSaturday: days.includes("sat"), includeSunday: days.includes("sun") });
      }
    }
    set(patch);
  };

  const spring = reduce ? { duration: 0.15 } : { type: "spring" as const, bounce: 0, duration: 0.4 };
  const pct = deal ? Math.round(deal.savingPct) : 0;

  return (
    <AnimatePresence initial={false}>
      {show && deal && (
        <motion.section
          key="best-deal"
          aria-label="Best deal"
          initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0, y: -8 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto", y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, y: -8 }}
          transition={spring}
          className="overflow-hidden"
        >
          <div className="border-primary/30 bg-primary/10 mb-6 flex items-start gap-3 rounded-[20px] border p-4">
            <div className="min-w-0 flex-1">
              <p className="text-primary text-[13px] font-semibold tracking-[0.02em]">Best deal</p>
              <p className="mt-1 text-[15px] leading-snug text-pretty">
                <strong>{deal.label}</strong> — ${deal.perUnit.toFixed(2)} per tiffin, you save {pct}% (${(deal.savingPerUnit * deal.payload.tiffinCount).toFixed(2)})
              </p>
              <button
                type="button"
                onClick={apply}
                className="bg-primary text-primary-foreground mt-3 h-11 cursor-pointer rounded-full px-5 text-sm font-semibold transition-transform duration-100 active:scale-[0.97] motion-reduce:active:scale-100"
              >
                Use this
              </button>
            </div>
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
