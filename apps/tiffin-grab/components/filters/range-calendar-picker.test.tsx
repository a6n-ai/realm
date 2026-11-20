// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { zonedDayStart } from "@foundry/commons/util/dates";
import { RangeCalendarPicker } from "./range-calendar-picker";

const TZ = "America/Toronto";

beforeAll(() => {
  HTMLElement.prototype.showPopover = function () {};
  HTMLElement.prototype.hidePopover = function () {};
  Element.prototype.getAnimations = () => [];
  Element.prototype.checkVisibility = () => true;
  document.head.append(
    Object.assign(document.createElement("style"), { textContent: "[popover][data-open] { display: block !important }" }),
  );
});

afterEach(cleanup);

function setup(props: Partial<React.ComponentProps<typeof RangeCalendarPicker>> = {}) {
  const onChange = vi.fn();
  render(<RangeCalendarPicker timeZone={TZ} onChange={onChange} {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /Any date|Nov|Oct/ }));
  return onChange;
}
const start = () => screen.getByLabelText("Start") as HTMLInputElement;
const end = () => screen.getByLabelText("End") as HTMLInputElement;
const type = (el: HTMLElement, value: string) => act(() => void fireEvent.change(el, { target: { value } }));

describe("RangeCalendarPicker popover", () => {
  it("applies typed Start and End as business-timezone day bounds", () => {
    const onChange = setup();
    type(start(), "Nov 3, 2026");
    type(end(), "2026-11-09");
    fireEvent.click(screen.getByRole("button", { name: /Apply/ }));
    expect(onChange).toHaveBeenCalledWith({
      from: zonedDayStart("2026-11-03", TZ),
      to: zonedDayStart("2026-11-10", TZ) - 1,
    });
  });

  it("applies on Enter in an input", () => {
    const onChange = setup();
    type(start(), "Oct 31, 2026");
    type(end(), "Nov 1, 2026");
    fireEvent.keyDown(end(), { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      from: zonedDayStart("2026-10-31", TZ),
      to: zonedDayStart("2026-11-02", TZ) - 1,
    });
  });

  it("flags an unparseable or reversed date and blocks Apply", () => {
    const onChange = setup();
    type(start(), "Nov 9, 2026");
    type(end(), "not a date");
    expect(end()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: /Apply/ })).toBeDisabled();
    fireEvent.keyDown(end(), { key: "Enter" });
    type(end(), "Nov 3, 2026");
    expect(end()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: /Apply/ })).toBeDisabled();
    fireEvent.keyDown(end(), { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects a date that rolls over (Feb 30)", () => {
    setup();
    type(start(), "2026-02-30");
    expect(start()).toHaveAttribute("aria-invalid", "true");
  });

  it("accepts month names and abbreviations but not made-up words", () => {
    setup();
    type(start(), "September 3, 2026");
    expect(start()).not.toHaveAttribute("aria-invalid", "true");
    type(start(), "Sept 3, 2026");
    expect(start()).not.toHaveAttribute("aria-invalid", "true");
    type(start(), "Novxyz 1, 2026");
    expect(start()).toHaveAttribute("aria-invalid", "true");
  });

  it("fills the inputs from calendar clicks and commits only on Apply", () => {
    const onChange = setup({ from: zonedDayStart("2026-11-03", TZ), to: zonedDayStart("2026-11-10", TZ) - 1 });
    expect(start().value).toBe("Nov 3, 2026");
    expect(end().value).toBe("Nov 9, 2026");
    fireEvent.click(screen.getByRole("button", { name: /November 12th, 2026/ }));
    fireEvent.click(screen.getByRole("button", { name: /November 14th, 2026/ }));
    expect(start().value).toBe("Nov 12, 2026");
    expect(end().value).toBe("Nov 14, 2026");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Apply/ }));
    expect(onChange).toHaveBeenCalledWith({
      from: zonedDayStart("2026-11-12", TZ),
      to: zonedDayStart("2026-11-15", TZ) - 1,
    });
  });

  it("shows the business timezone and a Monday-first week", () => {
    setup();
    expect(screen.getByText(TZ)).toBeInTheDocument();
    const heads = Array.from(document.querySelectorAll("th")).map((th) => th.textContent);
    expect(heads[0]).toMatch(/^Mo/);
  });

  it("offers a clear path that reports an empty range", () => {
    const onChange = setup({ from: zonedDayStart("2026-11-03", TZ), to: zonedDayStart("2026-11-10", TZ) - 1 });
    fireEvent.click(screen.getByRole("button", { name: "Any date" }));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("labels a same-year range with the year once", () => {
    render(<RangeCalendarPicker timeZone={TZ} onChange={() => {}} from={zonedDayStart("2026-11-01", TZ)} to={zonedDayStart("2026-12-01", TZ) - 1} />);
    expect(screen.getByRole("button", { name: "Nov 1 – Nov 30, 2026" })).toBeInTheDocument();
  });
});
