// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

let reducedMotion = false;
vi.mock("motion/react", () => ({ useReducedMotion: () => reducedMotion }));

import { TransitionLink } from "../transition-link";

beforeEach(() => { push.mockClear(); reducedMotion = false; delete (document as unknown as { startViewTransition?: unknown }).startViewTransition; });
afterEach(cleanup);

describe("TransitionLink", () => {
  it("uses startViewTransition when supported", () => {
    const start = vi.fn(function (this: Document, cb: () => void) {
      expect(this).toBe(document);
      cb();
      return { finished: Promise.resolve() };
    });
    (document as unknown as { startViewTransition: unknown }).startViewTransition = start;
    render(<TransitionLink href="/me/deliveries">Deliveries</TransitionLink>);
    fireEvent.click(screen.getByText("Deliveries"));
    expect(start).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith("/me/deliveries");
  });

  it("falls back to a plain push when the API is absent", () => {
    render(<TransitionLink href="/me/deliveries">Deliveries</TransitionLink>);
    fireEvent.click(screen.getByText("Deliveries"));
    expect(push).toHaveBeenCalledWith("/me/deliveries");
  });

  it("skips the transition under reduced motion", () => {
    reducedMotion = true;
    const start = vi.fn();
    (document as unknown as { startViewTransition: unknown }).startViewTransition = start;
    render(<TransitionLink href="/me/deliveries">Deliveries</TransitionLink>);
    fireEvent.click(screen.getByText("Deliveries"));
    expect(start).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/me/deliveries");
  });

  it("lets next/link handle navigation natively for object hrefs", () => {
    const start = vi.fn();
    (document as unknown as { startViewTransition: unknown }).startViewTransition = start;
    render(<TransitionLink href={{ pathname: "/me" }}>Profile</TransitionLink>);
    fireEvent.click(screen.getByText("Profile"));
    expect(start).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalledWith("[object Object]");
    expect(push).not.toHaveBeenCalled();
  });
});
