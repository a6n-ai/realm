// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { StepSchedule } from "../steps/step-schedule";
import { initialSelections, type WizardSelections } from "../selections";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";

// Auto-cleanup only registers when vitest runs with `globals: true`; this config
// does not, so without this every render stacks into one document and `screen`
// queries resolve against the first test's DOM.
afterEach(cleanup);

function freq(key: string, daysPerWeek: number, weekdays: string[] | null, courierDiscountPct = 0) {
  return { publicId: `frq_${key}`, key, name: key, daysPerWeek, weekdays, courierDiscountPct };
}

// Includes a 6-day row carrying Saturday — it must not be offered now that
// deliveries are Mon-Fri only.
const catalog = {
  plans: [],
  mealSizes: [],
  frequencies: [
    freq("1_day", 1, ["mon"]),
    freq("mwf", 3, ["mon", "wed", "fri"], 10),
    freq("4_day", 4, ["mon", "tue", "wed", "thu"]),
    freq("5_day", 5, ["mon", "tue", "wed", "thu", "fri"]),
    freq("6_day", 6, ["mon", "tue", "wed", "thu", "fri", "sat"]),
  ],
  durations: [],
  zones: [],
} as unknown as ClientCatalogSnapshot;

function selectionsFor(weekdays: string[]): WizardSelections {
  return { ...initialSelections, planKey: "veg", customWeekdays: weekdays as never, frequencyKey: `custom_${weekdays.join("_")}` };
}

function dayButton(label: string) {
  return screen.getAllByRole("button", { name: label })[0]!;
}

describe("delivery day picker — Mon-Fri only", () => {
  it("never renders Saturday or Sunday", () => {
    render(<StepSchedule catalog={catalog} selections={selectionsFor(["mon"])} set={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Sat" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sun" })).toBeNull();
    for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri"]) {
      expect(dayButton(d)).toBeDefined();
    }
  });

  it("does not offer a tiffin count that cannot be delivered Mon-Fri", () => {
    render(<StepSchedule catalog={catalog} selections={selectionsFor(["mon"])} set={vi.fn()} />);
    // 6 comes from the Sat-carrying catalog row and must be filtered out.
    expect(screen.queryByRole("button", { name: "6" })).toBeNull();
    expect(screen.getByRole("button", { name: "5" })).toBeDefined();
  });
});

describe("delivery days must equal tiffins per week", () => {
  it("defaults a new subscription to one delivery day", () => {
    // The wizard's own starting point, not a fixture — guards the default itself.
    expect(initialSelections.customWeekdays).toEqual(["mon"]);
    render(<StepSchedule catalog={catalog} selections={initialSelections} set={vi.fn()} />);
    expect(screen.getByText(/1 tiffin → 1 delivery\/week/)).toBeDefined();
  });

  it("4 tiffins/week exposes exactly 4 selected days", () => {
    render(<StepSchedule catalog={catalog} selections={selectionsFor(["mon", "tue", "wed", "thu"])} set={vi.fn()} />);
    const selected = ["Mon", "Tue", "Wed", "Thu"].filter((d) => dayButton(d).getAttribute("aria-pressed") === "true");
    expect(selected).toHaveLength(4);
    expect(dayButton("Fri").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/4 tiffins → 4 deliveries\/week/)).toBeDefined();
  });

  it("5 tiffins/week selects all five weekdays", () => {
    render(<StepSchedule catalog={catalog} selections={selectionsFor(["mon", "tue", "wed", "thu", "fri"])} set={vi.fn()} />);
    for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri"]) {
      expect(dayButton(d).getAttribute("aria-pressed")).toBe("true");
    }
  });

  it("moves the delivery instead of refusing when already at the cap", () => {
    const set = vi.fn();
    render(<StepSchedule catalog={catalog} selections={selectionsFor(["mon", "tue", "wed", "thu"])} set={set} />);
    fireEvent.click(dayButton("Fri"));

    // Still 4 days: Friday joins and the day picked longest ago gives way, so a
    // customer can re-arrange the days the wizard chose for them.
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ customWeekdays: ["tue", "wed", "thu", "fri"] }));
    expect(screen.getByRole("status").textContent).toMatch(/Moved Mon to Fri/);
  });

  it("keeps every weekday tappable at the cap, since a tap now moves a delivery", () => {
    render(<StepSchedule catalog={catalog} selections={selectionsFor(["mon", "tue", "wed", "thu"])} set={vi.fn()} />);
    expect(dayButton("Fri").getAttribute("aria-disabled")).toBeNull();
    expect((dayButton("Fri") as HTMLButtonElement).disabled).toBe(false);
  });

  it("drops the day chosen longest ago, not one just picked", () => {
    const set = vi.fn();
    const { rerender } = render(<StepSchedule catalog={catalog} selections={selectionsFor(["mon", "tue"])} set={set} />);
    fireEvent.click(dayButton("Wed"));
    expect(set).toHaveBeenLastCalledWith(expect.objectContaining({ customWeekdays: ["tue", "wed"] }));

    // Feed the new selection back in, as the wizard does.
    rerender(<StepSchedule catalog={catalog} selections={selectionsFor(["tue", "wed"])} set={set} />);
    fireEvent.click(dayButton("Thu"));
    // Tue was picked before Wed, so Tue goes — Wed, chosen a moment ago, stays.
    expect(set).toHaveBeenLastCalledWith(expect.objectContaining({ customWeekdays: ["wed", "thu"] }));
  });


  it("allows swapping a day by unselecting first", () => {
    const set = vi.fn();
    render(<StepSchedule catalog={catalog} selections={selectionsFor(["mon", "tue", "wed", "thu"])} set={set} />);
    fireEvent.click(dayButton("Mon"));
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ customWeekdays: ["tue", "wed", "thu"] }));
  });

  it("refuses to drop the last remaining delivery day", () => {
    const set = vi.fn();
    render(<StepSchedule catalog={catalog} selections={selectionsFor(["mon"])} set={set} />);
    fireEvent.click(dayButton("Mon"));
    expect(set).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/at least one delivery day/);
  });
});
