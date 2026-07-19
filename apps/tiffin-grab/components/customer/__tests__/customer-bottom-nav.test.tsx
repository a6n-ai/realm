// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let mockPathname = "/me";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push }),
}));

import { CustomerBottomNav } from "../customer-bottom-nav";

afterEach(cleanup);

describe("CustomerBottomNav", () => {
  it("marks only Home active on /me (exact match, not startsWith)", () => {
    mockPathname = "/me";
    render(<CustomerBottomNav />);
    expect(screen.getByRole("link", { name: /Home/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Deliveries/i })).not.toHaveAttribute("aria-current");
  });

  it("marks only Deliveries active on /me/deliveries (not Home too)", () => {
    mockPathname = "/me/deliveries";
    render(<CustomerBottomNav />);
    expect(screen.getByRole("link", { name: /Deliveries/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Home/i })).not.toHaveAttribute("aria-current");
  });

  it("renders a Menu tab to /me/menu", () => {
    mockPathname = "/me";
    render(<CustomerBottomNav />);
    expect(screen.getByRole("link", { name: /Menu/i })).toHaveAttribute("href", "/me/menu");
  });

  it("renders a Finances tab to /me/wallet", () => {
    mockPathname = "/me";
    render(<CustomerBottomNav />);
    expect(screen.getByRole("link", { name: /Finances/i })).toHaveAttribute("href", "/me/wallet");
  });

  it("renders 4 tabs (Home/Menu/Deliveries/Finances), not Meals/Profile", () => {
    mockPathname = "/me";
    render(<CustomerBottomNav />);
    ["Home", "Menu", "Deliveries", "Finances"].forEach((t) => expect(screen.getByText(t)).toBeInTheDocument());
    expect(screen.queryByText("Profile")).toBeNull();
    expect(screen.queryByText("Meals")).toBeNull();
  });

  it("New plan FAB navigates to /subscribe with a clear accessible name", () => {
    mockPathname = "/me";
    render(<CustomerBottomNav />);
    expect(screen.getByText("New plan")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Start a subscription/i }));
    expect(push).toHaveBeenCalledWith("/subscribe");
  });

  it("My plan FAB navigates to /me/deliveries when a live plan exists", () => {
    mockPathname = "/me";
    push.mockClear();
    render(<CustomerBottomNav hasLivePlan />);
    expect(screen.getByText("My plan")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Open calendar to pick meals/i }));
    expect(push).toHaveBeenCalledWith("/me/deliveries");
  });
});
