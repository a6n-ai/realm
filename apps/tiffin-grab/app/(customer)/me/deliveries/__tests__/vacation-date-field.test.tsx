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
    expect(screen.getByRole("button", { name: /pick a date/i })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: /aug 19, 2026/i })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /pick a date/i }));
    expect(screen.getByText("New delivery day")).toBeInTheDocument();
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });
});
