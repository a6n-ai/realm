// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSwipePages } from "../use-swipe-pages";

afterEach(cleanup);

function Harness({ canPrev = true, canNext = true, step, onTap }: { canPrev?: boolean; canNext?: boolean; step: (d: 1 | -1) => void; onTap: () => void }) {
  const { ref, bind } = useSwipePages({ page: "a", canPrev, canNext, step });
  return (
    <div ref={ref} data-testid="pages" {...bind}>
      <button type="button" onClick={onTap}>day</button>
    </div>
  );
}

const swipe = (el: HTMLElement, dx: number, dy = 0) => {
  fireEvent.pointerDown(el, { pointerId: 1, pointerType: "touch", clientX: 200, clientY: 100 });
  fireEvent.pointerMove(el, { pointerId: 1, pointerType: "touch", clientX: 200 + dx, clientY: 100 + dy });
  fireEvent.pointerUp(el, { pointerId: 1, pointerType: "touch", clientX: 200 + dx, clientY: 100 + dy });
};

describe("useSwipePages", () => {
  it("swiping left steps forward, right steps back, and never also taps a day", () => {
    const step = vi.fn();
    const onTap = vi.fn();
    render(<Harness step={step} onTap={onTap} />);
    const el = screen.getByTestId("pages");
    swipe(el, -120);
    expect(step).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByText("day"));
    expect(onTap).not.toHaveBeenCalled();
    swipe(el, 120);
    expect(step).toHaveBeenLastCalledWith(-1);
  });

  it("ignores vertical drags and short drags, and stops at the bounds", () => {
    const step = vi.fn();
    render(<Harness step={step} onTap={() => {}} canNext={false} />);
    const el = screen.getByTestId("pages");
    swipe(el, 5, 120);
    swipe(el, -20);
    swipe(el, -120);
    expect(step).not.toHaveBeenCalled();
  });
});
