// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Stub the Lottie primitive so this test does not exercise the player again.
vi.mock("../lottie", () => ({
  Lottie: ({ label }: { label?: string }) => <div data-testid="lottie" aria-label={label} />,
}));

import { LottieEmptyState } from "../lottie-empty-state";

afterEach(cleanup);

describe("LottieEmptyState", () => {
  it("renders title, body, action, and a labelled lottie", () => {
    render(
      <LottieEmptyState
        animation="empty-box"
        title="No deliveries yet"
        body="Your upcoming meals will show up here."
        action={<button>Browse plans</button>}
      />,
    );
    expect(screen.getByText("No deliveries yet")).toBeInTheDocument();
    expect(screen.getByText("Your upcoming meals will show up here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse plans" })).toBeInTheDocument();
    expect(screen.getByTestId("lottie")).toHaveAttribute("aria-label", "No deliveries yet");
  });
});
