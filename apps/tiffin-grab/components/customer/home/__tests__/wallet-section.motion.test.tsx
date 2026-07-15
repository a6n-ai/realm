// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no network stack, and the Lottie primitive fetches its JSON on
// mount — stub it so LottieEmptyState doesn't throw an unhandled rejection
// for the relative "/lottie/*.json" URL (see components/motion/__tests__/lottie.test.tsx).
const fakeAnimationData = { v: "5.5.7", fr: 30, layers: [] };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("motion/react", () => ({ useReducedMotion: () => true }));
vi.mock("@/components/motion", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/components/motion");
  return actual;
});
vi.mock("@/components/providers/timezone-provider", () => ({ useTimezone: () => "UTC" }));

import { WalletSection } from "../wallet-section";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => fakeAnimationData }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WalletSection motion wiring", () => {
  it("shows the balance via AnimatedNumber", () => {
    render(<WalletSection balance={1240} transactions={[]} />);
    expect(screen.getByText("1240")).toBeInTheDocument();
  });

  it("shows the lottie empty state when there are no transactions", () => {
    render(<WalletSection balance={0} transactions={[]} />);
    expect(screen.getByText(/no wallet activity/i)).toBeInTheDocument();
  });
});
