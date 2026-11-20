// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DateInput } from "./date-fields";

beforeAll(() => {
  Element.prototype.getAnimations = () => [];
  Element.prototype.checkVisibility = () => true;
  HTMLElement.prototype.showPopover ??= function () {};
  HTMLElement.prototype.hidePopover ??= function () {};
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DateInput hover hint", () => {
  it("makes the date button the hint trigger instead of a native title", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(<DateInput value="" onChange={() => {}} title="Starts the day after the cutoff" aria-label="Start" />);
    expect(container.querySelector("button[title]")).toBeNull();

    const button = screen.getByRole("button", { name: "Start" });
    await user.hover(button);
    await act(() => vi.advanceTimersByTimeAsync(200));

    const tooltip = document.getElementById(button.getAttribute("aria-describedby")!);
    expect(tooltip?.getAttribute("role")).toBe("tooltip");
    expect(tooltip?.textContent).toContain("Starts the day after the cutoff");
  });
});
