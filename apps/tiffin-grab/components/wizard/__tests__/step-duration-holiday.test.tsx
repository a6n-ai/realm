// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { TooltipProvider } from "@foundry/ui/tooltip";
import { StepDuration } from "../steps/step-duration";
import { initialSelections, type WizardSelections } from "../selections";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";

const catalog = {
  plans: [{ key: "p", allowedStartDays: ["mon", "tue", "wed", "thu", "fri"] }],
  mealSizes: [],
  frequencies: [],
  durations: [],
  zones: [],
  timezone: "America/Toronto",
  cutoffHour: undefined,
} as unknown as ClientCatalogSnapshot;

// 2030-02-01 is a Friday, so the earliest start is Mon 2030-02-04.
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2030-02-01T17:00:00Z")); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

function Harness({ holidayDates, start = "" }: { holidayDates: string[]; start?: string }) {
  const [sel, setSel] = useState<WizardSelections>({ ...initialSelections, planKey: "p", startDate: start });
  return (
    <TooltipProvider>
      <StepDuration catalog={catalog} selections={sel} set={(p) => setSel((s) => ({ ...s, ...p }))} result={null} holidayDates={holidayDates} />
      <output data-testid="start">{sel.startDate}</output>
    </TooltipProvider>
  );
}

describe("StepDuration with holidays", () => {
  it("preselects the first non-holiday day when the earliest day is a holiday", () => {
    render(<Harness holidayDates={["2030-02-04"]} />);
    expect(screen.getByTestId("start").textContent).toBe("2030-02-05");
  });

  it("preselects the earliest day when nothing is closed", () => {
    render(<Harness holidayDates={[]} />);
    expect(screen.getByTestId("start").textContent).toBe("2030-02-04");
  });

  it("replaces a stale holiday start with the first open day", () => {
    render(<Harness holidayDates={["2030-02-04", "2030-02-06"]} start="2030-02-06" />);
    expect(screen.getByTestId("start").textContent).toBe("2030-02-05");
  });

  it("clears the date and shows the error when a holiday is picked", () => {
    render(<Harness holidayDates={["2030-02-06"]} />);
    fireEvent.click(screen.getByRole("button", { name: /start date/i }));
    fireEvent.click(screen.getByRole("button", { name: "Wednesday, February 6" }));
    expect(screen.getByText("We are closed that day. Pick another start date")).toBeDefined();
  });
});
