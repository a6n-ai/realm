// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom lacks IntersectionObserver; mode="loop"/"hover" paths never construct
// one, but importing the component still requires the global to exist.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver ??=
  IntersectionObserverStub as unknown as typeof IntersectionObserver;

// Capture the props the underlying player receives.
const lottieProps: Record<string, unknown>[] = [];
vi.mock("lottie-react", () => ({
  default: (props: Record<string, unknown>) => {
    lottieProps.push(props);
    return <div data-testid="lottie-player" />;
  },
}));

// next/dynamic(ssr:false) — render the imported module synchronously in tests.
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<{ default: unknown }>) => {
    let Comp: unknown;
    loader().then((m) => (Comp = m.default));
    return (props: Record<string, unknown>) => {
      const C = Comp as (p: Record<string, unknown>) => React.JSX.Element;
      return C ? <C {...props} /> : null;
    };
  },
}));

let reducedMotion = false;
vi.mock("motion/react", () => ({ useReducedMotion: () => reducedMotion }));

function setMatchMedia(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: reduce, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

import { Lottie } from "../lottie";

// jsdom has no network stack, and Node's global fetch can't resolve a
// relative "/lottie/*.json" URL without a base — stub it so the component's
// fetch(src).then(r => r.json()) resolves with fake animation data.
const fakeAnimationData = { v: "5.5.7", fr: 30, layers: [] };

beforeEach(() => {
  lottieProps.length = 0;
  reducedMotion = false;
  setMatchMedia(false);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ json: async () => fakeAnimationData }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Lottie", () => {
  it("labels for a11y when a label is given", async () => {
    render(<Lottie src="/lottie/empty-box.json" label="No orders yet" mode="loop" />);
    expect(await screen.findByRole("img", { name: "No orders yet" })).toBeInTheDocument();
  });

  it("does not autoplay under reduced motion", async () => {
    reducedMotion = true;
    render(<Lottie src="/lottie/empty-box.json" mode="loop" />);
    await screen.findByTestId("lottie-player");
    expect(lottieProps.at(-1)?.autoplay).toBe(false);
  });

  it("autoplays a looping animation when motion is allowed", async () => {
    render(<Lottie src="/lottie/empty-box.json" mode="loop" />);
    await screen.findByTestId("lottie-player");
    expect(lottieProps.at(-1)?.autoplay).toBe(true);
    expect(lottieProps.at(-1)?.loop).toBe(true);
  });
});
