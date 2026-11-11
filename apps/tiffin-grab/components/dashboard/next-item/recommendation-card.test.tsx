// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@foundry/ui/tooltip";
import { RecommendationCardFrame } from "./recommendation-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(cleanup);

const item = { key: "k1", name: "Lead 1", href: "/dashboard/inquiries/p1" };

describe("RecommendationCardFrame", () => {
  it("dims, marks busy and shows a spinner while its refresh is pending", () => {
    const { container } = render(<TooltipProvider><RecommendationCardFrame item={item} pending /></TooltipProvider>);
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(container.firstElementChild).toHaveClass("opacity-60");
    expect(screen.getByRole("status", { name: "Updating" })).toBeInTheDocument();
  });

  it("is not busy at rest", () => {
    const { container } = render(<TooltipProvider><RecommendationCardFrame item={item} pending={false} /></TooltipProvider>);
    expect(container.firstElementChild).not.toHaveAttribute("aria-busy");
    expect(container.firstElementChild).not.toHaveClass("opacity-60");
    expect(screen.queryByRole("status", { name: "Updating" })).toBeNull();
  });
});
