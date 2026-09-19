// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { StepSchedule } from "../steps/step-schedule";
import { initialSelections, scheduleError, type WizardSelections } from "../selections";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";

afterEach(cleanup);

const freq = (key: string, weekdays: string[] | null) => ({ publicId: `frq_${key}`, key, name: key, daysPerWeek: weekdays?.length ?? 0, weekdays, courierDiscountPct: 0 });

const catalog = {
  plans: [],
  mealSizes: [],
  frequencies: [freq("mwf", ["mon", "wed", "fri"]), freq("5_day", ["mon", "tue", "wed", "thu", "fri"]), freq("legacy", null)],
  durations: [],
  zones: [],
  minTiffinsPerWeek: 2,
  maxTiffinsPerWeek: 5,
} as unknown as ClientCatalogSnapshot;

const sel = (eatingDays: string[], frequencyKey = "mwf"): WizardSelections => ({ ...initialSelections, frequencyKey, eatingDays: eatingDays as never });
const pill = (label: string) => screen.getByRole("button", { name: label }) as HTMLButtonElement;

describe("StepSchedule", () => {
  it("offers only frequencies with delivery days", () => {
    render(<StepSchedule catalog={catalog} selections={sel(["mon", "tue"])} set={vi.fn()} />);
    expect(screen.queryByText("legacy")).toBeNull();
    expect(screen.getByText("mwf")).toBeDefined();
  });

  it("disables unselected days at max but keeps selected ones toggleable", () => {
    render(<StepSchedule catalog={catalog} selections={sel(["mon", "tue", "wed", "thu", "fri"])} set={vi.fn()} />);
    expect(pill("Sat").disabled).toBe(true);
    expect(pill("Mon").disabled).toBe(false);
  });

  it("mirrors weekend flags when a weekend day is picked", () => {
    const set = vi.fn();
    render(<StepSchedule catalog={catalog} selections={sel(["mon", "tue"])} set={set} />);
    fireEvent.click(pill("Sat"));
    expect(set).toHaveBeenCalledWith({ eatingDays: ["mon", "tue", "sat"], includeSaturday: true, includeSunday: false });
  });

  it("previews trips on the carrying delivery day", () => {
    render(<StepSchedule catalog={catalog} selections={sel(["mon", "tue", "thu"])} set={vi.fn()} />);
    const rows = screen.getAllByRole("listitem").map((r) => r.textContent);
    expect(rows).toContain("Mon2 tiffinsfor Mon, Tue");
    expect(rows).toContain("Wed1 tiffinfor Thu");
  });

  it("errors and blocks below min", () => {
    render(<StepSchedule catalog={catalog} selections={sel(["mon"])} set={vi.fn()} />);
    expect(scheduleError(catalog, sel(["mon"]))).toMatch(/between 2 and 5/);
  });

  it("initialises to the first frequency with eating days equal to its delivery days", () => {
    const set = vi.fn();
    render(<StepSchedule catalog={catalog} selections={initialSelections} set={set} />);
    expect(set).toHaveBeenCalledWith({ frequencyKey: "mwf" });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ eatingDays: ["mon", "wed", "fri"] }));
  });

  it("switching frequency follows its delivery days while eating days are still the default", () => {
    const set = vi.fn();
    render(<StepSchedule catalog={catalog} selections={sel(["mon", "wed", "fri"])} set={set} />);
    fireEvent.click(screen.getByText("5_day"));
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ eatingDays: ["mon", "tue", "wed", "thu", "fri"] }));
  });

  it("keeps a customised pick when switching frequency", () => {
    const set = vi.fn();
    render(<StepSchedule catalog={catalog} selections={sel(["tue", "thu"])} set={set} />);
    fireEvent.click(screen.getByText("5_day"));
    expect(set).not.toHaveBeenCalledWith(expect.objectContaining({ eatingDays: expect.anything() }));
  });

  it("count control lists min..max and resizes the days", () => {
    const set = vi.fn();
    render(<StepSchedule catalog={catalog} selections={sel(["mon", "wed", "fri"])} set={set} />);
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["2", "3", "4", "5"]);
    fireEvent.click(screen.getByRole("radio", { name: "2" }));
    expect(set).toHaveBeenCalledWith({ eatingDays: ["mon", "wed"], includeSaturday: false, includeSunday: false });
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    expect(set).toHaveBeenCalledWith({ eatingDays: ["mon", "tue", "wed", "fri"], includeSaturday: false, includeSunday: false });
  });
});
