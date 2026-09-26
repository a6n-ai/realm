// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import { TooltipProvider } from "@foundry/ui/tooltip";
import { StepSchedule } from "../steps/step-schedule";
import { initialSelections, scheduleError, type WizardSelections } from "../selections";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";

// The app root provides this (app/layout.tsx); the step's delivery-schedule tooltip needs it.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: TooltipProvider });

afterEach(cleanup);

const freq = (key: string, weekdays: string[] | null) => ({ publicId: `frq_${key}`, key, name: key, daysPerWeek: weekdays?.length ?? 0, weekdays });

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
  it("shows the live tiffin count next to the day pills (no separate count list)", () => {
    render(<StepSchedule catalog={catalog} selections={sel(["mon", "wed", "fri"])} set={vi.fn()} />);
    expect(screen.queryByText("How many tiffins a week?")).toBeNull();
    expect(screen.getAllByText("tiffins a week").length).toBeGreaterThan(0);
  });

  it("shows a savings pill only for discounted frequencies", () => {
    const c = { ...catalog, discounts: [{ key: "d1", name: "d1", kind: "delivery", targetPublicId: "frq_mwf", percent: 6, minWeeks: null }, { key: "d2", name: "d2", kind: "delivery", targetPublicId: null, percent: 4, minWeeks: null }], frequencies: [freq("mwf", ["mon", "wed", "fri"]), freq("5_day", ["mon", "tue", "wed", "thu", "fri"])] } as unknown as ClientCatalogSnapshot;
    render(<StepSchedule catalog={c} selections={sel(["mon", "tue"])} set={vi.fn()} />);
    expect(screen.getAllByLabelText("Save 10%")).toHaveLength(1);
    expect(screen.getAllByLabelText("Save 4%")).toHaveLength(1);
  });

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
    expect(rows).toContain("Mon2 tiffinsMonTue");
    expect(rows).toContain("Wed1 tiffinThu");
  });

  it("errors and blocks below min", () => {
    render(<StepSchedule catalog={catalog} selections={sel(["mon"])} set={vi.fn()} />);
    expect(scheduleError(catalog, sel(["mon"]))).toMatch(/between 2 and 5/);
  });

  it("initialises to the first frequency and leaves eating days at the Mon-Fri default", () => {
    const set = vi.fn();
    render(<StepSchedule catalog={catalog} selections={initialSelections} set={set} />);
    expect(set).toHaveBeenCalledWith({ frequencyKey: "mwf" });
    expect(set).not.toHaveBeenCalledWith(expect.objectContaining({ eatingDays: ["mon", "wed", "fri"] }));
  });

  it("switching delivery type never changes eating days", () => {
    const set = vi.fn();
    render(<StepSchedule catalog={catalog} selections={sel(["mon", "wed", "fri"])} set={set} />);
    fireEvent.click(screen.getByText("5_day"));
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ frequencyKey: "5_day" });
  });

  it("keeps a customised pick when switching delivery type", () => {
    const set = vi.fn();
    render(<StepSchedule catalog={catalog} selections={sel(["tue", "thu"])} set={set} />);
    fireEvent.click(screen.getByText("5_day"));
    expect(set).not.toHaveBeenCalledWith(expect.objectContaining({ eatingDays: expect.anything() }));
  });
});
