// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ScheduleSection } from "../schedule-section";

afterEach(cleanup);

const frequencies = [
  { key: "mwf", name: "Mon Wed Fri", weekdays: ["mon", "wed", "fri"] as never },
  { key: "5", name: "Weekdays", weekdays: ["mon", "tue", "wed", "thu", "fri"] as never },
];
const setup = (eatingDays: string[], over = {}) => {
  const p = { onFrequencyChange: vi.fn(), onToggleDay: vi.fn() };
  render(<ScheduleSection frequencies={frequencies} frequencyKey="mwf" eatingDays={eatingDays as never} bounds={{ min: 2, max: 3 }} {...p} {...over} />);
  return p;
};

describe("ScheduleSection", () => {
  it("selects a frequency card", () => {
    const p = setup(["mon", "tue"]);
    fireEvent.click(screen.getByRole("radio", { name: /Weekdays/ }));
    expect(p.onFrequencyChange).toHaveBeenCalledWith("5");
  });

  it("disables unselected days at max, keeps selected toggleable", () => {
    const p = setup(["mon", "wed", "fri"]);
    expect((screen.getByRole("button", { name: "Sat" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Mon" }));
    expect(p.onToggleDay).toHaveBeenCalledWith("mon");
  });

  it("shows hint below min", () => {
    setup(["mon"]);
    expect(screen.getByRole("alert").textContent).toMatch(/between 2 and 3/);
  });
});
