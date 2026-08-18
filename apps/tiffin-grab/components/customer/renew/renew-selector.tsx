"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { nextWeekday, parseIsoDateUtc, weekdayKey } from "@realm/commons";
import { Card } from "@realm/ui/card";
import { Badge } from "@realm/ui/badge";
import { RadioGroup, RadioGroupItem } from "@realm/ui/radio-group";
import { Label } from "@realm/ui/label";
import { Input } from "@realm/ui/input";
import { Button } from "@realm/ui/button";
import type { ClientCatalogSnapshot, ClientMealSizeView } from "@/lib/catalog/types";
import type { PricingResult } from "@/lib/pricing";
import { reprice } from "@/app/(public)/subscribe/actions";
import { WIZARD_ORIGIN_KEY, WIZARD_STORAGE_KEY, type WizardSelections } from "@/components/wizard/selections";
import { MealSizeItems } from "@/components/wizard/meal-size-items";
import { MealSizePrice } from "@/components/wizard/meal-size-price";
import { Invoice } from "@/components/wizard/invoice";

type ScheduleType = "weekday" | "weekend";
type Weeks = 1 | 2 | 3 | 4;

const dayLabel: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

// earliestStartDate is the first day a new plan MAY start (exclusive end of the current
// plan's reserved band) — this is one day earlier, for "your plan runs through <date>" copy.
function dayBefore(iso: string): string {
  const d = parseIsoDateUtc(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function RenewSelector({
  mealSizes,
  catalog,
  defaultMealSizeId,
  earliestStartDate,
}: {
  mealSizes: ClientMealSizeView[];
  catalog: ClientCatalogSnapshot;
  defaultMealSizeId?: string;
  /** First date a new plan may start without overlapping an active/paused subscription
   * this customer already has running — null when they have none. See
   * myEarliestNewPlanStartDate in customer-deliveries.service.ts. */
  earliestStartDate?: string | null;
}) {
  const router = useRouter();
  const [mealSizeId, setMealSizeId] = useState(defaultMealSizeId ?? "");
  const [scheduleType, setScheduleType] = useState<ScheduleType>("weekday");
  const [weeks, setWeeks] = useState<Weeks>(1);
  const [startDate, setStartDate] = useState("");
  const [startDateError, setStartDateError] = useState<string | null>(null);
  const [result, setResult] = useState<PricingResult | null>(null);

  const mealSize = mealSizes.find((m) => m.publicId === mealSizeId) ?? null;
  const plan = mealSize ? catalog.plans.find((p) => p.key === mealSize.planKey) : null;
  const allowed = plan?.allowedStartDays ?? ["mon", "tue", "wed", "thu", "fri"];
  // The later of "tomorrow" and "the day after this customer's current plan finishes" —
  // an active/paused subscription reserves real delivery days, so a new plan can't start
  // inside that window (createCheckout rejects it server-side too; this just surfaces the
  // same constraint at pick-time instead of after the customer fills out the whole form).
  const minDate =
    earliestStartDate && earliestStartDate > nextWeekday(new Date()).toISOString().slice(0, 10)
      ? earliestStartDate
      : nextWeekday(new Date()).toISOString().slice(0, 10);

  const includeSaturday = scheduleType === "weekend";
  const includeSunday = scheduleType === "weekend";
  const tiffinsPerWeek = scheduleType === "weekend" ? 7 : 5;

  const selections: WizardSelections | null = mealSize && plan
    ? {
        planKey: plan.key as WizardSelections["planKey"],
        mealSizeId: mealSize.publicId,
        frequencyKey: "5_day",
        persons: 1,
        mealSlots: plan.offeredSlots,
        swapRuleIds: [],
        includeSaturday,
        includeSunday,
        durationWeeks: weeks,
        startDate,
      }
    : null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selections) { setResult(null); return; }
    let active = true;
    reprice(selections, undefined, selections.planKey ?? undefined)
      .then((r) => { if (active) setResult(r.pricing); })
      .catch(() => { if (active) setResult(null); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealSizeId, scheduleType, weeks, startDate]);

  function onStartDate(v: string) {
    if (!v) {
      setStartDate("");
      setStartDateError(null);
      return;
    }
    try {
      // Defense in depth beyond the input's `min` attribute — some mobile date pickers
      // let a value earlier than `min` through, and this is also the customer's first
      // signal of the overlap constraint, not just a redundant re-check.
      if (v < minDate) {
        setStartDate("");
        setStartDateError(
          earliestStartDate && minDate === earliestStartDate
            ? `You have a plan running through ${dayBefore(earliestStartDate)} — choose a start date after it ends`
            : `Earliest available start date is ${minDate}`,
        );
        return;
      }
      const wk = weekdayKey(parseIsoDateUtc(v));
      if (allowed.includes(wk)) {
        setStartDate(v);
        setStartDateError(null);
      } else {
        setStartDate("");
        setStartDateError("That day isn't available — choose one of: " + allowed.map((d) => dayLabel[d] ?? d).join(", "));
      }
    } catch {
      /* ignore malformed intermediate input */
    }
  }

  function continueToCheckout() {
    if (!selections) return;
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(selections));
    sessionStorage.setItem(WIZARD_ORIGIN_KEY, "renew");
    router.push("/checkout");
  }

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-sm font-medium">Choose a meal size</Label>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {mealSizes.map((m) => {
            const active = mealSizeId === m.publicId;
            return (
              <Card
                key={m.publicId}
                role="button"
                onClick={() => setMealSizeId(m.publicId)}
                className={`hover-lift cursor-pointer p-4 transition-[transform,box-shadow,background-color] active:scale-[0.99] ${active ? "ring-2 ring-primary" : "hover:bg-accent"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{m.name}</span>
                  <MealSizePrice meal={m} />
                </div>
                {m.description ? <p className="text-muted-foreground mt-1 text-sm text-pretty">{m.description}</p> : null}
                <div className="mt-1">
                  <MealSizeItems items={m.items} swapRules={m.swapRules} categoryLabels={catalog.categoryLabels} />
                </div>
                {active && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    <Badge variant="secondary">{m.kcalMin}–{m.kcalMax} kcal</Badge>
                    {m.proteinG != null && <Badge variant="secondary">P {m.proteinG}g</Badge>}
                    {m.carbsG != null && <Badge variant="secondary">C {m.carbsG}g</Badge>}
                    {m.fatG != null && <Badge variant="secondary">F {m.fatG}g</Badge>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium">Delivery days</Label>
        <RadioGroup
          className="mt-2 grid gap-2 sm:grid-cols-2"
          value={scheduleType}
          onValueChange={(v) => setScheduleType(v as ScheduleType)}
        >
          <div className="flex items-center gap-2 rounded-md border p-3">
            <RadioGroupItem id="sched-weekday" value="weekday" />
            <Label htmlFor="sched-weekday">Mon–Friday · 5 tiffins/week</Label>
          </div>
          <div className="flex items-center gap-2 rounded-md border p-3">
            <RadioGroupItem id="sched-weekend" value="weekend" />
            <Label htmlFor="sched-weekend">Mon–Sunday · 7 tiffins/week</Label>
          </div>
        </RadioGroup>
        {scheduleType === "weekend" && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Saturday and Sunday&apos;s tiffins are delivered together with Friday&apos;s — there&apos;s no separate
            weekend delivery.
          </p>
        )}
      </div>

      <div>
        <Label className="text-sm font-medium">How many tiffins</Label>
        <RadioGroup
          className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"
          value={String(weeks)}
          onValueChange={(v) => setWeeks(Number(v) as Weeks)}
        >
          {([1, 2, 3, 4] as const).map((w) => (
            <div key={w} className="flex items-center gap-2 rounded-md border p-3">
              <RadioGroupItem id={`weeks-${w}`} value={String(w)} />
              <Label htmlFor={`weeks-${w}`}>
                {w * tiffinsPerWeek} tiffins
                <span className="block text-xs text-muted-foreground">{w} week{w > 1 ? "s" : ""}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div>
        <Label className="text-sm font-medium">Start date</Label>
        <Input
          type="date"
          className="mt-2 w-full max-w-xs"
          min={minDate}
          value={startDate}
          onChange={(e) => onStartDate(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Deliveries start on a weekday ({allowed.map((d) => dayLabel[d] ?? d).join(", ")}); earliest {minDate}.
        </p>
        {earliestStartDate && minDate === earliestStartDate && !startDateError ? (
          <p className="mt-1.5 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-pretty">
            You have a plan running through {dayBefore(earliestStartDate)} — a new plan can start the day after.
          </p>
        ) : null}
        {startDateError && <p className="mt-1 text-xs text-destructive">{startDateError}</p>}
      </div>

      <Invoice result={result} />

      <Button
        type="button"
        size="lg"
        className="w-full sm:w-auto"
        disabled={!mealSizeId || !startDate}
        onClick={continueToCheckout}
      >
        Continue to checkout
      </Button>
    </div>
  );
}
