// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let reducedMotion = true; // default to reduced so the count-up resolves instantly
vi.mock("motion/react", () => ({ useReducedMotion: () => reducedMotion }));

import { AnimatedNumber } from "../animated-number";

beforeEach(() => { reducedMotion = true; });
afterEach(cleanup);

describe("AnimatedNumber", () => {
  it("renders the final value immediately under reduced motion", () => {
    render(<AnimatedNumber value={1240} />);
    expect(screen.getByText("1240")).toBeInTheDocument();
  });

  it("applies the format function", () => {
    render(<AnimatedNumber value={5} format={(n) => `$${n.toFixed(2)}`} />);
    expect(screen.getByText("$5.00")).toBeInTheDocument();
  });
});
