// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const isMobile = vi.fn(() => false);
vi.mock("@realm/ui/use-mobile", () => ({ useIsMobile: () => isMobile() }));

import { VacationDateField } from "../vacation-date-field";

afterEach(() => {
  isMobile.mockReturnValue(false);
  cleanup();
});

describe("VacationDateField", () => {
  it("does not use a native date input", () => {
    render(
      <VacationDateField
        id="start"
        label="Start date"
        value=""
        onChange={vi.fn()}
        today="2026-08-19"
      />,
    );
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(screen.getByRole("button", { name: /start date/i })).toBeInTheDocument();
    expect(screen.getByText("Pick a date")).toBeInTheDocument();
  });

  it("shows the selected calendar date on the trigger", () => {
    render(
      <VacationDateField
        id="start"
        label="Start date"
        value="2026-08-19"
        onChange={vi.fn()}
        today="2026-08-19"
      />,
    );
    expect(screen.getByText(/aug 19, 2026/i)).toBeInTheDocument();
  });

  it("opens a bottom drawer on mobile instead of a popover", () => {
    isMobile.mockReturnValue(true);
    render(
      <VacationDateField
        id="start"
        label="New delivery day"
        value=""
        onChange={vi.fn()}
        today="2026-08-19"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /new delivery day/i }));
    expect(screen.getAllByText("New delivery day").length).toBeGreaterThan(1);
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("lets the customer pick today as the vacation start", () => {
    const onChange = vi.fn();
    render(
      <VacationDateField
        id="start"
        label="Start date"
        value=""
        onChange={onChange}
        today="2026-08-19"
        minDate="2026-08-19"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /start date/i }));
    const todayCell = document.querySelector('[data-day="2026-08-19"]');
    expect(todayCell).not.toBeNull();
    expect(todayCell).not.toHaveAttribute("data-disabled");
    const todayButton = todayCell!.querySelector("button");
    expect(todayButton).not.toBeNull();
    expect(todayButton).toBeEnabled();
    fireEvent.click(todayButton!);
    expect(onChange).toHaveBeenCalledWith("2026-08-19");
  });

  it("keeps days before minDate disabled", () => {
    render(
      <VacationDateField
        id="start"
        label="Start date"
        value=""
        onChange={vi.fn()}
        today="2026-08-19"
        minDate="2026-08-19"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /start date/i }));
    expect(document.querySelector('[data-day="2026-08-18"]')).toHaveAttribute("data-disabled");
  });
});
