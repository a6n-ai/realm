import { useState } from "react";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import { Label } from "@foundry/ui/label";
import { CurrentPlanHint, type CurrentPlanSummary } from "../current-plan-hint";
import { clubbedQuantities, customFrequencyKey, orderDeliveryDays, type DayOfWeek } from "@/lib/menu/delivery-days";

// Deliveries run Mon-Fri only. Weekend tiffins still exist as *quantity* clubbed
// onto a weekday (see clubbedQuantities); what's removed is the ability to pick
// Sat/Sun as a delivery DAY. orderDeliveryDays was already called with
// includeSaturday/includeSunday false, so the weekend was never in the derived
// plan — the picker just used to offer it anyway.
const WEEKDAY_ORDER = ["mon", "tue", "wed", "thu", "fri"] as const satisfies readonly DayOfWeek[];
/** The days a customer may pick — a strict subset of DayOfWeek, so the label map
 * is exhaustive over exactly these and adding a day here is a compile error
 * until it is labelled. */
type SelectableDay = (typeof WEEKDAY_ORDER)[number];
const WEEKDAY_LABEL: Record<SelectableDay, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri" };
const MAX_DELIVERY_DAYS = WEEKDAY_ORDER.length;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Drop any weekend day a catalog row or stored selection still carries. */
function weekdaysOnly(days: DayOfWeek[]): SelectableDay[] {
  return days.filter((d): d is SelectableDay => (WEEKDAY_ORDER as readonly DayOfWeek[]).includes(d));
}

function sameDaySet(a: DayOfWeek[], b: DayOfWeek[]): boolean {
  return a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");
}

function sorted(days: SelectableDay[]): SelectableDay[] {
  return [...days].sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b));
}

/** The weekday set implied by the current selections — an explicit custom
 * pick, or whatever the matched (or hardcoded 5_day/mwf) catalog row implies. */
function currentWeekdays(catalog: ClientCatalogSnapshot, selections: WizardSelections): SelectableDay[] {
  if (selections.customWeekdays?.length) return sorted(weekdaysOnly(selections.customWeekdays));
  const row = catalog.frequencies.find((f) => f.key === selections.frequencyKey);
  return sorted(weekdaysOnly(orderDeliveryDays({
    frequencyKey: selections.frequencyKey,
    weekdays: (row?.weekdays as DayOfWeek[] | null) ?? null,
    includeSaturday: false,
    includeSunday: false,
  })));
}

/** An active catalog row whose weekday set exactly matches — this is the only
 * thing that earns a discount; a same-count-but-different-days custom pick
 * never does. */
function matchingRow(catalog: ClientCatalogSnapshot, weekdays: SelectableDay[]) {
  return catalog.frequencies.find((f) => {
    const rowDays = (f.weekdays as DayOfWeek[] | null) ?? (f.key === "mwf" ? ["mon", "wed", "fri"] : f.key === "5_day" ? ["mon", "tue", "wed", "thu", "fri"] : null);
    return rowDays && sameDaySet(rowDays as DayOfWeek[], weekdays);
  });
}

export function StepSchedule({
  catalog,
  selections,
  set,
  currentPlan = null,
}: {
  catalog: ClientCatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
  currentPlan?: CurrentPlanSummary | null;
}) {
  const [notice, setNotice] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  // The order days were picked, so a tap at the cap replaces the day chosen
  // longest ago. Held locally because the wizard only stores the SET of days.
  const [pickOrder, setPickOrder] = useState<SelectableDay[]>([]);
  // Every count deliverable Mon-Fri is offered, not just the ones an admin has a
  // catalog row for: a count without a row is priced as a custom pattern, and
  // deriving this list from the catalog alone would hide counts (and could leave
  // the current selection — the 1-day default — with nothing highlighted).
  // Counts above 5 are impossible now that a delivery is one day.
  const tiffinCounts = Array.from({ length: MAX_DELIVERY_DAYS }, (_, i) => i + 1);
  const weekdays = currentWeekdays(catalog, selections);
  const tiffinCount = weekdays.length;
  // Reconciled each render rather than synced in an effect: the selection can
  // change from outside this component (tiffin count, restored session), and a
  // stale queue would swap out a day that is no longer selected.
  const queue = [
    ...pickOrder.filter((d) => weekdays.includes(d)),
    ...weekdays.filter((d) => !pickOrder.includes(d)),
  ];
  const match = matchingRow(catalog, weekdays);
  const quantities = clubbedQuantities(weekdays);

  const pickCount = (count: number) => {
    setNotice(null);
    setPickOrder([]);
    // Default to the first admin pattern at this count so switching counts lands
    // on a real (possibly discounted) cadence — but only if that pattern is
    // deliverable Mon-Fri. A row that includes Sat/Sun is skipped, otherwise the
    // picker would show fewer active days than the tiffin count it just set.
    const defaultRow = catalog.frequencies.find((f) => {
      if (f.daysPerWeek !== count) return false;
      const rowDays = (f.weekdays as DayOfWeek[] | null) ?? null;
      return !rowDays || weekdaysOnly(rowDays).length === rowDays.length;
    });
    if (defaultRow) {
      set({ frequencyKey: defaultRow.key, customWeekdays: undefined });
    } else {
      const days = WEEKDAY_ORDER.slice(0, count);
      set({ frequencyKey: customFrequencyKey(days), customWeekdays: days });
    }
  };

  const commit = (next: SelectableDay[], order: SelectableDay[]) => {
    setPickOrder(order);
    const row = matchingRow(catalog, next);
    if (row) set({ frequencyKey: row.key, customWeekdays: undefined });
    else set({ frequencyKey: customFrequencyKey(next), customWeekdays: next });
  };

  const toggleDay = (day: SelectableDay) => {
    if (weekdays.includes(day)) {
      // Never let the picker collapse to zero days — a customer must always
      // have at least one delivery day to remove-toggle down to.
      if (weekdays.length <= 1) {
        setNotice({ text: "You need at least one delivery day.", tone: "error" });
        return;
      }
      setNotice(null);
      commit(weekdays.filter((d) => d !== day), queue.filter((d) => d !== day));
      return;
    }

    if (weekdays.length < tiffinCount) {
      setNotice(null);
      commit(sorted([...weekdays, day]), [...queue, day]);
      return;
    }

    // At the cap, tapping a new day MOVES the delivery rather than refusing:
    // the day count must equal tiffins/week, and the customer is re-arranging
    // days the wizard picked for them. The day chosen longest ago gives way,
    // and the swap is announced so nothing changes silently.
    const oldest = queue[0];
    if (!oldest) return;
    setNotice({
      text: `Moved ${WEEKDAY_LABEL[oldest]} to ${WEEKDAY_LABEL[day]} — ${plural(tiffinCount, "tiffin", "tiffins")} a week means ${plural(tiffinCount, "delivery day", "delivery days")}.`,
      tone: "info",
    });
    commit(sorted([...weekdays.filter((d) => d !== oldest), day]), [...queue.filter((d) => d !== oldest), day]);
  };

  return (
    <div className="space-y-6">
      {currentPlan ? (
        <CurrentPlanHint>
          Your current plan runs <strong>{currentPlan.daysPerWeek} days/wk</strong>. Set the
          schedule for this new subscription independently.
        </CurrentPlanHint>
      ) : null}

      <div>
        <Label className="text-primary text-xs font-semibold tracking-[2.5px] uppercase">Tiffins per week</Label>
        <div className="mt-3 flex flex-wrap gap-3">
          {tiffinCounts.map((count) => {
            const active = tiffinCount === count;
            return (
              <button
                key={count}
                type="button"
                onClick={() => pickCount(count)}
                className={`border-foreground flex h-[54px] min-w-[54px] cursor-pointer items-center justify-center rounded-full border-[1.5px] px-5 text-lg font-semibold tabular-nums transition-transform active:scale-[0.97] ${active ? "bg-primary text-primary-foreground" : ""}`}
              >
                {count}
              </button>
            );
          })}
        </div>
        <p className="text-muted-foreground mt-2 text-sm">
          {tiffinCount} {tiffinCount === 1 ? "tiffin" : "tiffins"} → {tiffinCount} {tiffinCount === 1 ? "delivery" : "deliveries"}/week
        </p>
      </div>

      <div>
        <Label className="text-primary text-xs font-semibold tracking-[2.5px] uppercase">Delivery days</Label>
        <div className="mt-3 flex flex-wrap gap-2">
          {WEEKDAY_ORDER.map((day) => {
            const active = weekdays.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={active}
                className={`border-foreground flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] px-4 text-sm font-semibold transition-transform active:scale-[0.97] ${active ? "bg-primary text-primary-foreground" : ""}`}
              >
                {WEEKDAY_LABEL[day]}
              </button>
            );
          })}
        </div>

        {notice ? (
          <p role="status" className={`mt-2 text-sm text-pretty ${notice.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {notice.text}
          </p>
        ) : null}

        <div className="mt-3 min-h-[44px] rounded-2xl border-[1.5px] border-foreground/10 bg-muted/30 px-4 py-3 text-sm transition-colors">
          {match && match.courierDiscountPct > 0 ? (
            <p className="text-primary font-medium">
              Eligible for {match.courierDiscountPct}% off — matches our {match.name} plan.
            </p>
          ) : match ? (
            <p className="text-foreground/80">Standard schedule — no clubbing needed, one tiffin per delivery.</p>
          ) : (
            <p className="text-foreground/80">Custom schedule — standard pricing, tiffins clubbed onto your chosen days.</p>
          )}
        </div>

        {tiffinCount < MAX_DELIVERY_DAYS ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {WEEKDAY_ORDER.map((day) => (
              <div
                key={day}
                className={`flex h-9 min-w-9 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${weekdays.includes(day) ? "bg-primary/15 text-primary" : "text-muted-foreground/50"}`}
                title={WEEKDAY_LABEL[day]}
              >
                {weekdays.includes(day) ? quantities[day] : "–"}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
