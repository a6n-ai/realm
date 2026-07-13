// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// motion's `whileInView` relies on IntersectionObserver, which jsdom lacks.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver ??= IntersectionObserverStub as unknown as typeof IntersectionObserver;

let reducedMotion = false;
vi.mock("motion/react", async () => {
  const actual = await vi.importActual<typeof import("motion/react")>("motion/react");
  return { ...actual, useReducedMotion: () => reducedMotion };
});

import { Reveal } from "../reveal";

beforeEach(() => { reducedMotion = false; });
afterEach(cleanup);

describe("Reveal", () => {
  it("renders its children", () => {
    render(<Reveal><p>hello</p></Reveal>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders children inside a group", () => {
    render(
      <Reveal.Group>
        <Reveal><p>one</p></Reveal>
        <Reveal><p>two</p></Reveal>
      </Reveal.Group>,
    );
    expect(screen.getByText("one")).toBeInTheDocument();
    expect(screen.getByText("two")).toBeInTheDocument();
  });

  it("still renders children under reduced motion", () => {
    reducedMotion = true;
    render(<Reveal><p>visible</p></Reveal>);
    expect(screen.getByText("visible")).toBeInTheDocument();
  });
});
