"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import { BottomBar, Button, OptionCard } from "@/components/customer/kit";
import { DateField } from "@/components/customer/date-field";
import { SubscribeChrome } from "@/components/wizard/subscribe-chrome";
import { Progress } from "@/components/wizard/progress";
import { WIZARD_ORIGIN_KEY, WIZARD_STEP_KEY, WIZARD_STORAGE_KEY, type WizardSelections } from "@/components/wizard/selections";
import { trialDeliveryDates } from "@/lib/trial/schedule";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { TrialDayPicker } from "@/components/wizard/trial-day-picker";

const STEPS = ["Meal", "Start"] as const;

export type TrialSizeOption = {
  publicId: string;
  name: string;
  planKey: string;
  planName: string;
  basePrice: number;
  description: string | null;
};

function firstAllowed(from: string, weekdays: readonly string[]): string {
  const cursor = parseIsoDateUtc(from);
  for (let i = 0; i < 21; i++) {
    if (weekdays.includes(weekdayKey(cursor))) return cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return from;
}

export function TrialWizard({
  sizes,
  maxDays,
  weekdays,
  earliest,
  today,
}: {
  sizes: TrialSizeOption[];
  maxDays: number;
  weekdays: string[];
  earliest: string;
  today: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [mealId, setMealId] = useState(sizes[0]?.publicId ?? "");
  // A multi-day trial picks its days; a one-day trial just picks a start date on a send day.
  const multiDay = maxDays > 1;
  const [picks, setPicks] = useState<DayOfWeek[]>(() => weekdays.slice(0, 1) as DayOfWeek[]);
  const sendOn = multiDay ? picks : weekdays;
  const days = multiDay ? picks.length : 1;
  const [startDate, setStartDate] = useState(() => firstAllowed(earliest, weekdays));
  const changePicks = (next: DayOfWeek[]) => {
    setPicks(next);
    if (!next.includes(weekdayKey(parseIsoDateUtc(startDate)) as DayOfWeek)) {
      setStartDate(firstAllowed(startDate > earliest ? startDate : earliest, next));
    }
  };
  const meal = sizes.find((s) => s.publicId === mealId) ?? null;

  const dates = useMemo(() => {
    if (!startDate || !sendOn.includes(weekdayKey(parseIsoDateUtc(startDate)))) return [];
    try {
      return trialDeliveryDates(startDate, days, sendOn);
    } catch {
      return [];
    }
  }, [startDate, days, sendOn]);

  const blocked = step === 0
    ? (meal ? null : "Pick a trial meal to continue.")
    : dates.length === days
      ? null
      : "Choose a start date on a day a trial can be sent.";

  const go = () => {
    if (!meal || dates.length !== days) return;
    const selections: WizardSelections = {
      planKey: meal.planKey,
      mealSizeId: meal.publicId,
      frequencyKey: "",
      eatingDays: multiDay ? picks : [],
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate,
      trialDays: days,
      addonSelections: [],
    };
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    sessionStorage.setItem(WIZARD_ORIGIN_KEY, "trial");
    sessionStorage.setItem(WIZARD_STEP_KEY, "1");
    router.push("/checkout", { transitionTypes: ["nav-forward"] });
  };

  return (
    <div className="pb-44 sm:pb-6">
      <SubscribeChrome
        closeHref="/me"
        onBack={() => (step > 0 ? setStep(0) : router.push("/me", { transitionTypes: ["nav-back"] }))}
        stepTag={STEPS[step]}
      />
      <Progress steps={STEPS} current={step} />
      <h2 className="mb-6 text-[34px] leading-[1.06] font-bold tracking-[-0.03em] text-balance sm:text-[40px]">
        {step === 0 ? "Pick a trial meal." : multiDay ? "Which days, and when?" : "When should it arrive?"}
      </h2>

      {step === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {sizes.map((size) => (
            <OptionCard
              key={size.publicId}
              selected={mealId === size.publicId}
              onClick={() => setMealId(size.publicId)}
              className="flex min-w-0 flex-col gap-2 p-4"
            >
              <span className="text-muted-foreground text-xs font-medium">{size.planName}</span>
              <span className="text-[17px] leading-snug font-semibold tracking-[-0.02em]">{size.name}</span>
              {size.description ? <p className="text-muted-foreground text-sm text-pretty">{size.description}</p> : null}
              <span className="text-primary text-[17px] font-bold">${size.basePrice.toFixed(2)} / meal</span>
            </OptionCard>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {multiDay && <TrialDayPicker sendDays={weekdays} maxDays={maxDays} picked={picks} onChange={changePicks} />}
          <DateField
            id="trial-start"
            label="Start date"
            value={startDate}
            onChange={setStartDate}
            today={today}
            minDate={earliest}
            allowedDays={sendOn}
          />
          {dates.length > 0 && (
            <p className="text-muted-foreground text-sm">
              We&apos;ll send {dates.length === 1 ? "this day" : "these days"}: {dates.join(", ")}.
            </p>
          )}
        </div>
      )}

      <BottomBar alignEnd note={blocked ?? undefined} className="sm:sticky sm:mt-6 sm:px-0">
        <Button variant="quiet" size="lg" className="w-24 shrink-0 sm:hidden" onClick={() => (step > 0 ? setStep(0) : router.push("/me"))}>Back</Button>
        {step === 0 ? (
          <Button variant="primary" size="lg" className="flex-1 sm:min-h-10 sm:flex-none sm:px-8" disabled={blocked != null} onClick={() => setStep(1)}>Next</Button>
        ) : (
          <Button variant="primary" size="lg" className="flex-1 sm:min-h-10 sm:flex-none sm:px-8" disabled={blocked != null} onClick={go}>
            Continue to checkout
          </Button>
        )}
      </BottomBar>
    </div>
  );
}
